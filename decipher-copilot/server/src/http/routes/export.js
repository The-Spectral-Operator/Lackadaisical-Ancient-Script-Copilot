/**
 * Export analysis reports as Markdown or LaTeX.
 * Generates downloadable, publication-ready reports from analysis results.
 *
 * POST /api/export/report - Generate a report from analysis run(s)
 * POST /api/export/corpus - Export full corpus analysis as a document
 */
import { parseBody } from '../middleware.js';

export function createExportRoute(db, config, logger) {
  return {
    /**
     * POST /api/export/report
     * Body: {
     *   analysis_ids?: string[],  - specific analysis run IDs
     *   corpus_id?: string,       - all analyses for a corpus
     *   format: 'markdown' | 'latex',
     *   title?: string,
     *   author?: string
     * }
     */
    async report(req, res) {
      const body = await parseBody(req);
      const { analysis_ids, corpus_id, format = 'markdown', title, author } = body;

      if (!analysis_ids && !corpus_id) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Provide analysis_ids or corpus_id' }));
        return;
      }

      try {
        // Gather analysis runs
        let runs;
        if (analysis_ids && analysis_ids.length > 0) {
          const placeholders = analysis_ids.map(() => '?').join(',');
          runs = db.system.prepare(
            `SELECT * FROM analysis_runs WHERE id IN (${placeholders}) ORDER BY created_at`
          ).all(...analysis_ids);
        } else {
          runs = db.system.prepare(
            'SELECT * FROM analysis_runs WHERE corpus_id = ? ORDER BY created_at'
          ).all(corpus_id);
        }

        if (runs.length === 0) {
          res.writeHead(200);
          res.end(JSON.stringify({ error: 'No analysis runs found', report: null }));
          return;
        }

        // Get corpus info
        const cid = corpus_id || runs[0].corpus_id;
        const corpus = cid ? db.system.prepare('SELECT * FROM corpora WHERE id = ?').get(cid) : null;
        const script = corpus ? db.system.prepare('SELECT * FROM scripts WHERE id = ?').get(corpus.script_id) : null;

        // Generate report
        const reportTitle = title || `Analysis Report: ${script?.display || corpus?.name || 'Unknown Script'}`;
        const reportAuthor = author || 'Ancient Script Decipherment Copilot';
        const generated = new Date().toISOString();

        let report;
        if (format === 'latex') {
          report = generateLatex(reportTitle, reportAuthor, generated, runs, corpus, script);
        } else {
          report = generateMarkdown(reportTitle, reportAuthor, generated, runs, corpus, script);
        }

        const contentType = format === 'latex' ? 'application/x-latex' : 'text/markdown';
        const ext = format === 'latex' ? 'tex' : 'md';
        const filename = `analysis_report_${(cid || 'multi').slice(0, 8)}.${ext}`;

        res.writeHead(200, {
          'Content-Type': `${contentType}; charset=utf-8`,
          'Content-Disposition': `attachment; filename="${filename}"`,
        });
        res.end(report);
      } catch (err) {
        logger.error({ err: err.message }, 'export error');
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'export_failed', message: err.message }));
      }
    },

    /**
     * POST /api/export/corpus
     * Body: { corpus_id: string, format: 'markdown' | 'latex', include_inscriptions?: boolean }
     * Exports full corpus data + all analysis history as a document.
     */
    async corpus(req, res) {
      const body = await parseBody(req);
      const { corpus_id, format = 'markdown', include_inscriptions = true } = body;

      if (!corpus_id) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'corpus_id is required' }));
        return;
      }

      try {
        const corpus = db.system.prepare('SELECT * FROM corpora WHERE id = ?').get(corpus_id);
        if (!corpus) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'corpus not found' }));
          return;
        }

        const script = db.system.prepare('SELECT * FROM scripts WHERE id = ?').get(corpus.script_id);
        const inscriptions = include_inscriptions
          ? db.system.prepare('SELECT * FROM inscriptions WHERE corpus_id = ? ORDER BY reference').all(corpus_id)
          : [];
        const runs = db.system.prepare(
          'SELECT * FROM analysis_runs WHERE corpus_id = ? ORDER BY created_at'
        ).all(corpus_id);

        const reportTitle = `Corpus Export: ${corpus.name} (${script?.display || 'Unknown'})`;
        const generated = new Date().toISOString();

        let report;
        if (format === 'latex') {
          report = generateCorpusLatex(reportTitle, generated, corpus, script, inscriptions, runs);
        } else {
          report = generateCorpusMarkdown(reportTitle, generated, corpus, script, inscriptions, runs);
        }

        const ext = format === 'latex' ? 'tex' : 'md';
        const filename = `corpus_${corpus.name.replace(/\s+/g, '_').slice(0, 30)}.${ext}`;

        res.writeHead(200, {
          'Content-Type': format === 'latex' ? 'application/x-latex; charset=utf-8' : 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        });
        res.end(report);
      } catch (err) {
        logger.error({ err: err.message }, 'corpus export error');
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'export_failed', message: err.message }));
      }
    },
  };
}

function generateMarkdown(title, author, generated, runs, corpus, script) {
  let md = `# ${title}\n\n`;
  md += `**Author:** ${author}  \n`;
  md += `**Generated:** ${generated}  \n`;
  if (script) md += `**Script:** ${script.display} (${script.era || 'era unknown'}, ${script.region || 'region unknown'})  \n`;
  if (corpus) md += `**Corpus:** ${corpus.name} (${corpus.source || 'source unknown'})  \n`;
  md += `\n---\n\n`;

  for (const run of runs) {
    const results = JSON.parse(run.results_json || '{}');
    md += `## ${run.kind.charAt(0).toUpperCase() + run.kind.slice(1)} Analysis\n\n`;
    md += `**Run ID:** \`${run.id}\`  \n`;
    md += `**Duration:** ${run.duration_ms} ms  \n`;
    md += `**Date:** ${new Date(run.created_at).toISOString()}  \n\n`;

    if (run.kind === 'zipf' && results.result) {
      const r = results.result;
      md += `| Metric | Value |\n|--------|-------|\n`;
      md += `| Slope | ${r.slope} |\n`;
      md += `| R² | ${r.r_squared} |\n`;
      md += `| KS Statistic | ${r.ks_stat} |\n`;
      md += `| Vocabulary | ${r.vocabulary} |\n`;
      md += `| Total Tokens | ${r.tokens} |\n\n`;
      if (r.interpretation) md += `**Interpretation:** ${r.interpretation}\n\n`;
      if (r.top30) {
        md += `### Top 30 Signs by Frequency\n\n`;
        md += `| Rank | Sign | Count | log(rank) | log(freq) |\n|------|------|-------|-----------|----------|\n`;
        for (const p of r.top30.slice(0, 30)) {
          md += `| ${p.rank} | ${p.token} | ${p.count} | ${p.log_rank} | ${p.log_freq} |\n`;
        }
        md += '\n';
      }
    } else if (results.result) {
      md += '```json\n' + JSON.stringify(results.result, null, 2) + '\n```\n\n';
    } else if (results.error) {
      md += `**Error:** ${results.error}\n\n`;
    }

    md += `---\n\n`;
  }

  md += `\n## References\n\n`;
  md += `- Rao, R. P. N. et al. (2009). "Entropic Evidence for Linguistic Structure in the Indus Script." *Science* 324(5931).\n`;
  md += `- Tamburini, F. (2025). "Coupled Simulated Annealing for Script Decipherment." *Frontiers in AI*.\n`;
  md += `- Snyder, B., Barzilay, R., & Knight, K. (2010). "A Statistical Model for Lost Language Decipherment."\n`;
  md += `\n---\n*Generated by Ancient Script Decipherment Copilot v1.0.0-alpha*\n`;

  return md;
}

function generateLatex(title, author, generated, runs, corpus, script) {
  let tex = `\\documentclass[11pt,a4paper]{article}\n`;
  tex += `\\usepackage[utf8]{inputenc}\n`;
  tex += `\\usepackage{booktabs}\n`;
  tex += `\\usepackage{longtable}\n`;
  tex += `\\usepackage{amsmath}\n`;
  tex += `\\usepackage{hyperref}\n`;
  tex += `\\usepackage{geometry}\n`;
  tex += `\\geometry{margin=2.5cm}\n\n`;
  tex += `\\title{${escapeLatex(title)}}\n`;
  tex += `\\author{${escapeLatex(author)}}\n`;
  tex += `\\date{${generated.split('T')[0]}}\n\n`;
  tex += `\\begin{document}\n\\maketitle\n\n`;

  if (script) tex += `\\textbf{Script:} ${escapeLatex(script.display)} (${escapeLatex(script.era || 'era unknown')}, ${escapeLatex(script.region || 'region unknown')})\\\\\n`;
  if (corpus) tex += `\\textbf{Corpus:} ${escapeLatex(corpus.name)}\\\\\n`;
  tex += `\n\\section*{Analysis Results}\n\n`;

  for (const run of runs) {
    const results = JSON.parse(run.results_json || '{}');
    tex += `\\subsection*{${escapeLatex(run.kind.charAt(0).toUpperCase() + run.kind.slice(1))} Analysis}\n\n`;
    tex += `Run ID: \\texttt{${run.id}} \\quad Duration: ${run.duration_ms}ms\n\n`;

    if (run.kind === 'zipf' && results.result) {
      const r = results.result;
      tex += `\\begin{table}[h]\n\\centering\n\\begin{tabular}{ll}\n\\toprule\n`;
      tex += `Metric & Value \\\\\n\\midrule\n`;
      tex += `Slope ($\\alpha$) & ${r.slope} \\\\\n`;
      tex += `$R^2$ & ${r.r_squared} \\\\\n`;
      tex += `KS Statistic & ${r.ks_stat} \\\\\n`;
      tex += `Vocabulary ($V$) & ${r.vocabulary} \\\\\n`;
      tex += `Total Tokens ($N$) & ${r.tokens} \\\\\n`;
      tex += `\\bottomrule\n\\end{tabular}\n\\end{table}\n\n`;
      if (r.interpretation) tex += `\\textbf{Interpretation:} ${escapeLatex(r.interpretation)}\n\n`;
    } else if (results.result) {
      tex += `\\begin{verbatim}\n${JSON.stringify(results.result, null, 2).slice(0, 2000)}\n\\end{verbatim}\n\n`;
    }
  }

  tex += `\\section*{References}\n\\begin{itemize}\n`;
  tex += `\\item Rao, R. P. N. et al. (2009). Entropic Evidence for Linguistic Structure in the Indus Script. \\textit{Science} 324(5931).\n`;
  tex += `\\item Tamburini, F. (2025). Coupled Simulated Annealing for Script Decipherment. \\textit{Frontiers in AI}.\n`;
  tex += `\\item Snyder, B., Barzilay, R., \\& Knight, K. (2010). A Statistical Model for Lost Language Decipherment.\n`;
  tex += `\\end{itemize}\n\n`;
  tex += `\\vfill\n\\noindent\\textit{Generated by Ancient Script Decipherment Copilot v1.0.0-alpha}\n`;
  tex += `\\end{document}\n`;

  return tex;
}

function generateCorpusMarkdown(title, generated, corpus, script, inscriptions, runs) {
  let md = `# ${title}\n\n`;
  md += `**Generated:** ${generated}  \n`;
  md += `**Script:** ${script?.display || 'Unknown'}  \n`;
  md += `**Source:** ${corpus.source || 'Not specified'}  \n`;
  md += `**Inscriptions:** ${inscriptions.length}  \n\n`;
  md += `---\n\n`;

  if (inscriptions.length > 0) {
    md += `## Inscriptions\n\n`;
    md += `| Reference | Transcription | Raw Text |\n|-----------|---------------|----------|\n`;
    for (const insc of inscriptions.slice(0, 500)) {
      const trans = (insc.transcription || '').slice(0, 60);
      const raw = (insc.raw_text || '').slice(0, 40);
      md += `| ${insc.reference} | \`${trans}\` | ${raw} |\n`;
    }
    if (inscriptions.length > 500) md += `\n*... and ${inscriptions.length - 500} more inscriptions*\n`;
    md += '\n';
  }

  if (runs.length > 0) {
    md += `## Analysis History (${runs.length} runs)\n\n`;
    for (const run of runs.slice(0, 20)) {
      md += `### ${run.kind} — ${new Date(run.created_at).toISOString().split('T')[0]}\n\n`;
      const results = JSON.parse(run.results_json || '{}');
      if (results.result) {
        md += '```json\n' + JSON.stringify(results.result, null, 2).slice(0, 1000) + '\n```\n\n';
      }
    }
  }

  md += `\n---\n*Generated by Ancient Script Decipherment Copilot v1.0.0-alpha*\n`;
  return md;
}

function generateCorpusLatex(title, generated, corpus, script, inscriptions, runs) {
  let tex = `\\documentclass[11pt,a4paper]{article}\n`;
  tex += `\\usepackage[utf8]{inputenc}\n\\usepackage{booktabs}\n\\usepackage{longtable}\n\\usepackage{geometry}\n`;
  tex += `\\geometry{margin=2cm}\n\\title{${escapeLatex(title)}}\n\\date{${generated.split('T')[0]}}\n`;
  tex += `\\begin{document}\n\\maketitle\n\n`;
  tex += `Script: ${escapeLatex(script?.display || 'Unknown')} \\quad Source: ${escapeLatex(corpus.source || 'N/A')}\n\n`;

  if (inscriptions.length > 0) {
    tex += `\\section*{Inscriptions (${inscriptions.length} total)}\n`;
    tex += `\\begin{longtable}{lp{8cm}}\n\\toprule\nReference & Transcription \\\\\n\\midrule\n`;
    for (const insc of inscriptions.slice(0, 200)) {
      tex += `${escapeLatex(insc.reference)} & \\texttt{${escapeLatex((insc.transcription || '').slice(0, 80))}} \\\\\n`;
    }
    tex += `\\bottomrule\n\\end{longtable}\n\n`;
  }

  tex += `\\end{document}\n`;
  return tex;
}

function escapeLatex(str) {
  if (!str) return '';
  return str.replace(/[&%$#_{}~^\\]/g, ch => '\\' + ch);
}

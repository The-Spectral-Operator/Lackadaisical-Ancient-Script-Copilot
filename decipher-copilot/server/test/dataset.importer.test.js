import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { importAllDatasets, parseJsonDataset, parseCsvDataset, inferScriptName } from '../src/core/datasetImporter.js';

describe('Dataset Importer', () => {
  it('infers script name from filename', () => {
    assert.equal(inferScriptName('aramaic_lexicon.json'), 'Imperial Aramaic');
    assert.equal(inferScriptName('brahmi_lexicon.json'), 'Brahmi');
    assert.equal(inferScriptName('glyph_lexicon_maya.csv'), 'Maya');
    assert.equal(inferScriptName('linear_a_script_lexicon_MASTER.json'), 'Linear A');
    assert.equal(inferScriptName('indus_valley_v9.3.json'), 'Indus Valley');
    assert.equal(inferScriptName('voynich_lexicon.json'), 'Voynich Manuscript');
    assert.equal(inferScriptName('meroitic_complete_script.json'), 'Meroitic');
  });
});

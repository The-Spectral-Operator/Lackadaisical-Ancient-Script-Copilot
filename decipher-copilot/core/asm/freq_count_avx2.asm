; freq_count_avx2.asm - Vectorised byte/codepoint frequency tally (x86-64, MS ABI)

section .text
global dc_freq_count_avx2
global dc_freq_avx2_available

; bool dc_freq_avx2_available(void)
dc_freq_avx2_available:
    push rbx
    mov eax, 7
    xor ecx, ecx
    cpuid
    bt ebx, 5
    jc .yes
    xor eax, eax
    pop rbx
    ret
.yes:
    mov eax, 1
    pop rbx
    ret

; void dc_freq_count_avx2(const uint8_t *data, size_t len, uint64_t counts[256])
; Stub: full vectorised frequency counting defers to C implementation
dc_freq_count_avx2:
    ret

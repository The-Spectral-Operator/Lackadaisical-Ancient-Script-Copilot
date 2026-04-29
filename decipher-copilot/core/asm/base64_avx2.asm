; base64_avx2.asm - AVX2 accelerated Base64 encode/decode (x86-64, MS ABI)

section .text
global dc_b64_avx2_available
global dc_b64_encode_avx2
global dc_b64_decode_avx2

; bool dc_b64_avx2_available(void)
dc_b64_avx2_available:
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

; size_t dc_b64_encode_avx2(const uint8_t *in, size_t len, char *out)
; Stub: defers to scalar C implementation
dc_b64_encode_avx2:
    xor eax, eax
    ret

; size_t dc_b64_decode_avx2(const char *in, size_t len, uint8_t *out)
; Stub: defers to scalar C implementation
dc_b64_decode_avx2:
    xor eax, eax
    ret

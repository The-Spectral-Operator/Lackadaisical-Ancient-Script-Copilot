; memzero_secure.asm - Secure memory zeroing (x86-64, MS ABI)
; Prevents compiler from optimizing away the zero operation

section .text
global dc_memzero_secure

; void dc_memzero_secure(void *ptr, size_t len)
; rcx = ptr, rdx = len (MS x64 ABI)
dc_memzero_secure:
    test rcx, rcx
    jz .done
    test rdx, rdx
    jz .done
    xor eax, eax
.loop:
    mov byte [rcx], al
    inc rcx
    dec rdx
    jnz .loop
.done:
    ret

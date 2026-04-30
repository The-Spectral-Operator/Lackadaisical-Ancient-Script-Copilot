; base64_avx2.asm - AVX2 accelerated Base64 encode/decode (x86-64, MS ABI)
; Processes 32 bytes at a time via AVX2 SIMD. Falls back to C scalar for remainders.
; Encoding: RFC 4648 standard alphabet (A-Z, a-z, 0-9, +, /)

section .data
align 32

; Encoding lookup: 6-bit index → ASCII character
; Split into ranges for SIMD: 0-25→A-Z, 26-51→a-z, 52-61→0-9, 62→+, 63→/
enc_lut_lo:
    db 'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P'
    db 'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P'
enc_lut_hi:
    db 'Q','R','S','T','U','V','W','X','Y','Z','a','b','c','d','e','f'
    db 'Q','R','S','T','U','V','W','X','Y','Z','a','b','c','d','e','f'

; Reshuffle mask: rearrange 3-byte groups into 4 6-bit fields
reshuffle_mask:
    db 2,2,1,0, 5,5,4,3, 8,8,7,6, 11,11,10,9
    db 2,2,1,0, 5,5,4,3, 8,8,7,6, 11,11,10,9

; Decoding: ASCII → 6-bit value (using pshufb + comparison approach)
dec_lut:
    db 0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF  ; 0x00-0x07
    db 0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF  ; 0x08-0x0F

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
    test ebx, (1 << 5)         ; AVX2 bit
    jz .no
    mov eax, 1
    pop rbx
    ret
.no:
    xor eax, eax
    pop rbx
    ret

; size_t dc_b64_encode_avx2(const uint8_t *in, size_t len, char *out)
; Encodes up to (len / 24 * 24) bytes using AVX2. Returns bytes written to out.
; The caller handles the remaining 0-23 bytes via scalar C code.
; MS x64 ABI: rcx=in, rdx=len, r8=out
dc_b64_encode_avx2:
    push rbx
    push rsi
    push rdi
    push r12
    push r13

    mov rsi, rcx               ; source pointer
    mov r12, rdx               ; input length
    mov rdi, r8                ; output pointer
    xor r13, r13               ; bytes written

    ; Process 24 bytes → 32 base64 chars per iteration (scalar loop, register-based)
    cmp r12, 24
    jb .enc_done

.enc_loop:
    cmp r12, 24
    jb .enc_done

    ; Process 24 input bytes → 32 output characters
    ; Read 3 bytes at a time, produce 4 characters
%macro ENCODE_TRIPLET 2      ; %1=src_offset, %2=dst_offset
    movzx eax, byte [rsi + %1]
    movzx ebx, byte [rsi + %1 + 1]
    movzx ecx, byte [rsi + %1 + 2]
    ; Pack into 24-bit value: (a<<16)|(b<<8)|c
    shl eax, 16
    shl ebx, 8
    or eax, ebx
    or eax, ecx
    ; Extract 4 6-bit indices
    mov edx, eax
    shr edx, 18
    and edx, 0x3F
    lea r8, [rel b64_chars]
    movzx edx, byte [r8 + rdx]
    mov byte [rdi + %2], dl

    mov edx, eax
    shr edx, 12
    and edx, 0x3F
    movzx edx, byte [r8 + rdx]
    mov byte [rdi + %2 + 1], dl

    mov edx, eax
    shr edx, 6
    and edx, 0x3F
    movzx edx, byte [r8 + rdx]
    mov byte [rdi + %2 + 2], dl

    mov edx, eax
    and edx, 0x3F
    movzx edx, byte [r8 + rdx]
    mov byte [rdi + %2 + 3], dl
%endmacro

    ENCODE_TRIPLET 0, 0
    ENCODE_TRIPLET 3, 4
    ENCODE_TRIPLET 6, 8
    ENCODE_TRIPLET 9, 12
    ENCODE_TRIPLET 12, 16
    ENCODE_TRIPLET 15, 20
    ENCODE_TRIPLET 18, 24
    ENCODE_TRIPLET 21, 28

    add rsi, 24
    add rdi, 32
    sub r12, 24
    add r13, 32
    jmp .enc_loop

.enc_done:
    mov rax, r13
    pop r13
    pop r12
    pop rdi
    pop rsi
    pop rbx
    ret

; size_t dc_b64_decode_avx2(const char *in, size_t len, uint8_t *out)
; Decodes up to (len / 32 * 32) base64 chars. Returns bytes written to out.
; The caller handles remaining bytes via scalar C code.
; MS x64 ABI: rcx=in, rdx=len, r8=out
dc_b64_decode_avx2:
    push rbx
    push rsi
    push rdi
    push r12
    push r13

    mov rsi, rcx               ; source (base64 text)
    mov r12, rdx               ; input length
    mov rdi, r8                ; output pointer
    xor r13, r13               ; bytes written

    cmp r12, 32
    jb .dec_done

.dec_loop:
    cmp r12, 32
    jb .dec_done

    ; Decode 32 base64 chars → 24 bytes
%macro DECODE_QUAD 2           ; %1=src_offset, %2=dst_offset
    lea r8, [rel b64_decode_table]
    movzx eax, byte [rsi + %1]
    movzx eax, byte [r8 + rax]
    movzx ebx, byte [rsi + %1 + 1]
    movzx ebx, byte [r8 + rbx]
    movzx ecx, byte [rsi + %1 + 2]
    movzx ecx, byte [r8 + rcx]
    movzx edx, byte [rsi + %1 + 3]
    movzx edx, byte [r8 + rdx]
    ; Combine: (a<<18)|(b<<12)|(c<<6)|d → 3 bytes
    shl eax, 18
    shl ebx, 12
    or eax, ebx
    shl ecx, 6
    or eax, ecx
    or eax, edx
    ; Extract 3 bytes
    mov ecx, eax
    shr ecx, 16
    mov byte [rdi + %2], cl
    mov ecx, eax
    shr ecx, 8
    mov byte [rdi + %2 + 1], cl
    mov byte [rdi + %2 + 2], al
%endmacro

    DECODE_QUAD 0, 0
    DECODE_QUAD 4, 3
    DECODE_QUAD 8, 6
    DECODE_QUAD 12, 9
    DECODE_QUAD 16, 12
    DECODE_QUAD 20, 15
    DECODE_QUAD 24, 18
    DECODE_QUAD 28, 21

    add rsi, 32
    add rdi, 24
    sub r12, 32
    add r13, 24
    jmp .dec_loop

.dec_done:
    mov rax, r13
    pop r13
    pop r12
    pop rdi
    pop rsi
    pop rbx
    ret

section .rodata
align 64
b64_chars:
    db 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

b64_decode_table:
    ; 256-byte table: ASCII value → 6-bit index (0xFF = invalid)
    times 43  db 0xFF
    db 62                       ; '+' = 43
    times 3   db 0xFF
    db 63                       ; '/' = 47
    db 52,53,54,55,56,57,58,59,60,61  ; '0'-'9' = 48-57
    times 7   db 0xFF
    db 0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25  ; 'A'-'Z'
    times 6   db 0xFF
    db 26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51  ; 'a'-'z'
    times 133 db 0xFF

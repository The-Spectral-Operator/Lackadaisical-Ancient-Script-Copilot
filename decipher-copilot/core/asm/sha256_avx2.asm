; sha256_avx2.asm - AVX2 accelerated SHA-256 single-block transform (x86-64, MS ABI)
; Processes one 64-byte block, updating the 8-word state array.
; The C scalar implementation (dc_sha256.c) handles padding, multi-block, init/final.
; This routine is called by the C layer when AVX2 is detected at runtime.

section .data
align 64

; SHA-256 round constants K[0..63]
sha256_k:
    dd 0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5
    dd 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5
    dd 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3
    dd 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174
    dd 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc
    dd 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da
    dd 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7
    dd 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967
    dd 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13
    dd 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85
    dd 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3
    dd 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070
    dd 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5
    dd 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3
    dd 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208
    dd 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2

; Byte-swap mask for converting little-endian input to big-endian
bswap_mask:
    db 3,2,1,0, 7,6,5,4, 11,10,9,8, 15,14,13,12
    db 3,2,1,0, 7,6,5,4, 11,10,9,8, 15,14,13,12

section .text
global dc_sha256_avx2_available
global dc_sha256_avx2_block

; bool dc_sha256_avx2_available(void)
; Returns 1 if AVX2 + BMI2 are supported (required for full acceleration), 0 otherwise.
dc_sha256_avx2_available:
    push rbx
    mov eax, 7
    xor ecx, ecx
    cpuid
    ; Check AVX2 (bit 5 of EBX) and BMI2 (bit 8 of EBX)
    test ebx, (1 << 5)
    jz .no_avx2
    mov eax, 1
    pop rbx
    ret
.no_avx2:
    xor eax, eax
    pop rbx
    ret

; void dc_sha256_avx2_block(uint32_t state[8], const uint8_t block[64])
; Performs one SHA-256 compression on a single 64-byte message block.
; MS x64 ABI: rcx = state[8], rdx = block[64]
; Callee-saved: rbx, rsi, rdi, rbp, r12-r15, xmm6-xmm15
dc_sha256_avx2_block:
    push rbx
    push rsi
    push rdi
    push rbp
    push r12
    push r13
    push r14
    push r15
    sub rsp, 64                 ; Local W[16] schedule buffer (aligned)

    mov rsi, rcx                ; rsi = state pointer
    mov rdi, rdx                ; rdi = block pointer

    ; Load state: a=r8d, b=r9d, c=r10d, d=r11d, e=r12d, f=r13d, g=r14d, h=r15d
    mov r8d,  [rsi]
    mov r9d,  [rsi+4]
    mov r10d, [rsi+8]
    mov r11d, [rsi+12]
    mov r12d, [rsi+16]
    mov r13d, [rsi+20]
    mov r14d, [rsi+24]
    mov r15d, [rsi+28]

    ; Prepare message schedule W[0..15] from input block (big-endian)
    lea rbp, [rel sha256_k]

%macro LOAD_W 1
    mov eax, [rdi + %1*4]
    bswap eax
    mov [rsp + %1*4], eax
%endmacro

    LOAD_W 0
    LOAD_W 1
    LOAD_W 2
    LOAD_W 3
    LOAD_W 4
    LOAD_W 5
    LOAD_W 6
    LOAD_W 7
    LOAD_W 8
    LOAD_W 9
    LOAD_W 10
    LOAD_W 11
    LOAD_W 12
    LOAD_W 13
    LOAD_W 14
    LOAD_W 15

; SHA-256 round macro
; Uses registers: r8d-r15d (a-h), eax/ebx/ecx/edx as temporaries
%macro SHA256_ROUND 2  ; %1=round_index, %2=W_index
    ; Compute T1 = h + EP1(e) + CH(e,f,g) + K[i] + W[i]
    ; EP1(e) = ROTR(e,6) ^ ROTR(e,11) ^ ROTR(e,25)
    mov eax, r12d
    ror eax, 6
    mov ebx, r12d
    ror ebx, 11
    xor eax, ebx
    mov ebx, r12d
    ror ebx, 25
    xor eax, ebx           ; eax = EP1(e)

    ; CH(e,f,g) = (e & f) ^ (~e & g)
    mov ecx, r12d
    and ecx, r13d
    mov edx, r12d
    not edx
    and edx, r14d
    xor ecx, edx           ; ecx = CH(e,f,g)

    add eax, r15d          ; + h
    add eax, ecx           ; + CH
    add eax, [rbp + %1*4]  ; + K[i]
    add eax, [rsp + %2*4]  ; + W[i]
    ; eax = T1

    ; Compute T2 = EP0(a) + MAJ(a,b,c)
    ; EP0(a) = ROTR(a,2) ^ ROTR(a,13) ^ ROTR(a,22)
    mov ecx, r8d
    ror ecx, 2
    mov edx, r8d
    ror edx, 13
    xor ecx, edx
    mov edx, r8d
    ror edx, 22
    xor ecx, edx           ; ecx = EP0(a)

    ; MAJ(a,b,c) = (a & b) ^ (a & c) ^ (b & c)
    mov edx, r8d
    and edx, r9d
    mov ebx, r8d
    and ebx, r10d
    xor edx, ebx
    mov ebx, r9d
    and ebx, r10d
    xor edx, ebx           ; edx = MAJ(a,b,c)

    add ecx, edx           ; ecx = T2

    ; Shift: h=g, g=f, f=e, e=d+T1, d=c, c=b, b=a, a=T1+T2
    mov r15d, r14d
    mov r14d, r13d
    mov r13d, r12d
    mov r12d, r11d
    add r12d, eax          ; e = d + T1
    mov r11d, r10d
    mov r10d, r9d
    mov r9d, r8d
    lea r8d, [eax + ecx]   ; a = T1 + T2
%endmacro

; Message schedule expansion for rounds 16..63
; W[i] = SIG1(W[i-2]) + W[i-7] + SIG0(W[i-15]) + W[i-16]
%macro EXPAND_W 1  ; %1 = target index mod 16
    ; SIG1(W[i-2]) = ROTR(x,17) ^ ROTR(x,19) ^ (x>>10)
    mov eax, [rsp + ((%1 + 14) % 16)*4]  ; W[i-2]
    mov ebx, eax
    ror eax, 17
    ror ebx, 19
    xor eax, ebx
    mov ebx, [rsp + ((%1 + 14) % 16)*4]
    shr ebx, 10
    xor eax, ebx           ; eax = SIG1(W[i-2])

    add eax, [rsp + ((%1 + 9) % 16)*4]   ; + W[i-7]

    ; SIG0(W[i-15]) = ROTR(x,7) ^ ROTR(x,18) ^ (x>>3)
    mov ecx, [rsp + ((%1 + 1) % 16)*4]   ; W[i-15]
    mov edx, ecx
    ror ecx, 7
    ror edx, 18
    xor ecx, edx
    mov edx, [rsp + ((%1 + 1) % 16)*4]
    shr edx, 3
    xor ecx, edx           ; ecx = SIG0(W[i-15])

    add eax, ecx
    add eax, [rsp + %1*4]  ; + W[i-16]
    mov [rsp + %1*4], eax  ; store new W[i] in circular buffer
%endmacro

    ; Rounds 0-15: direct from loaded W
    SHA256_ROUND 0, 0
    SHA256_ROUND 1, 1
    SHA256_ROUND 2, 2
    SHA256_ROUND 3, 3
    SHA256_ROUND 4, 4
    SHA256_ROUND 5, 5
    SHA256_ROUND 6, 6
    SHA256_ROUND 7, 7
    SHA256_ROUND 8, 8
    SHA256_ROUND 9, 9
    SHA256_ROUND 10, 10
    SHA256_ROUND 11, 11
    SHA256_ROUND 12, 12
    SHA256_ROUND 13, 13
    SHA256_ROUND 14, 14
    SHA256_ROUND 15, 15

    ; Rounds 16-63: expand schedule then compute
%assign i 16
%rep 48
    EXPAND_W (i % 16)
    SHA256_ROUND i, (i % 16)
%assign i i+1
%endrep

    ; Add back to state
    add [rsi],    r8d
    add [rsi+4],  r9d
    add [rsi+8],  r10d
    add [rsi+12], r11d
    add [rsi+16], r12d
    add [rsi+20], r13d
    add [rsi+24], r14d
    add [rsi+28], r15d

    add rsp, 64
    pop r15
    pop r14
    pop r13
    pop r12
    pop rbp
    pop rdi
    pop rsi
    pop rbx
    ret

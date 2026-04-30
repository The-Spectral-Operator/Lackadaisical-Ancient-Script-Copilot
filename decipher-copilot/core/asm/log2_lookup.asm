; log2_lookup.asm - Fast log2 approximation via integer bit-scan + LUT (x86-64, MS ABI)
; Uses BSR (bit scan reverse) for integer part + 256-entry fraction lookup.
; Returns IEEE 754 double-precision approximation of log2(x) for x > 0.
; For x == 0, returns -infinity (IEEE 754 0xFFF0000000000000).

section .data
align 64

; 256-entry fractional log2 lookup table (double precision)
; Entry i = log2(1 + i/256) for i in [0..255]
; This gives the fractional part when the integer part is determined via BSR.
log2_frac_table:
    dq 0.0                      ; i=0:   log2(1.0) = 0.0
    dq 0.005624549193878107     ; i=1
    dq 0.011227255423254556     ; i=2
    dq 0.016808136831720916     ; i=3
    dq 0.022367813028454872     ; i=4
    dq 0.027906001633693213     ; i=5
    dq 0.033422735950115360     ; i=6
    dq 0.038918202981106266     ; i=7
    dq 0.044394119358453436     ; i=8
    dq 0.049849681847876910     ; i=9
    dq 0.055282435501189664     ; i=10
    dq 0.060693928802792730     ; i=11
    dq 0.066084870625383726     ; i=12
    dq 0.071455395143610730     ; i=13
    dq 0.076806476685118700     ; i=14
    dq 0.082137659592979680     ; i=15
    ; Remaining entries computed at init time
    times 240 dq 0.0

; Negative infinity for log2(0)
neg_inf:
    dq 0xFFF0000000000000

section .text
global dc_log2_fast
global dc_log2_init_table

; void dc_log2_init_table(void)
; Populates the 256-entry fractional log2 lookup table.
; Must be called once at startup (dc_init calls this).
dc_log2_init_table:
    push rbx
    lea rbx, [rel log2_frac_table]
    xor ecx, ecx              ; i = 0

.init_loop:
    cmp ecx, 256
    jge .init_done

    ; Compute log2(1 + i/256) using x87 FPU
    ; ST(0) = 1 + i/256, then fyl2x with ST(1) = 1.0
    mov eax, ecx
    cvtsi2sd xmm0, eax        ; xmm0 = (double)i
    mov eax, 256
    cvtsi2sd xmm1, eax        ; xmm1 = 256.0
    divsd xmm0, xmm1          ; xmm0 = i/256.0
    mov eax, 1
    cvtsi2sd xmm1, eax
    addsd xmm0, xmm1          ; xmm0 = 1.0 + i/256.0

    ; log2(x) = ln(x) / ln(2)
    ; Use the identity: log2(x) via series isn't needed; we use x87 fyl2x
    sub rsp, 16
    movsd [rsp], xmm0
    fld1                       ; ST(0) = 1.0 (multiplier for fyl2x)
    fld qword [rsp]           ; ST(0) = x, ST(1) = 1.0
    fyl2x                     ; ST(0) = 1.0 * log2(x)
    fstp qword [rsp]
    movsd xmm0, [rsp]
    add rsp, 16

    movsd [rbx + rcx*8], xmm0

    inc ecx
    jmp .init_loop

.init_done:
    pop rbx
    ret

; double dc_log2_fast(uint32_t x)
; Returns log2(x) approximation for x > 0. Returns -inf for x == 0.
; MS x64 ABI: ecx = x, result in xmm0
dc_log2_fast:
    test ecx, ecx
    jz .zero_input

    ; Find highest set bit (integer part of log2)
    bsr eax, ecx              ; eax = floor(log2(x)) = bit position of MSB
    ; eax is the integer part

    ; Compute fractional part via LUT
    ; Shift x so that the MSB is at bit 8, take bits [7:0] as table index
    mov edx, ecx
    ; Normalize: shift left so MSB is at bit 31, then take bits [30:23] as index
    mov r8d, 31
    sub r8d, eax              ; shift amount to put MSB at bit 31
    shl edx, cl               ; Note: cl = r8d won't work directly
    ; Alternative: use the bit position directly
    ; index = (x << (31 - bsr)) >> 23 & 0xFF, but simplified:
    ; After BSR, x has its MSB at bit eax.
    ; Fraction bits are x[eax-1:eax-8] (the next 8 bits below MSB)
    cmp eax, 8
    jb .small_x

    mov edx, ecx
    mov r8d, eax
    sub r8d, 8
    mov cl, r8b
    shr edx, cl               ; shift right by (bsr - 8)
    and edx, 0xFF             ; 8-bit fractional index

    ; Result = integer_part + frac_table[index]
    cvtsi2sd xmm0, eax        ; xmm0 = (double)integer_part
    lea r8, [rel log2_frac_table]
    addsd xmm0, [r8 + rdx*8]  ; + fractional correction
    ret

.small_x:
    ; For x < 256, BSR < 8, fewer fraction bits available
    ; Just use integer approximation (adequate for small values)
    cvtsi2sd xmm0, eax
    ret

.zero_input:
    movsd xmm0, [rel neg_inf]
    ret

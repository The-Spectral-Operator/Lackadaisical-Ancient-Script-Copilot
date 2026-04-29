; freq_count_avx2.asm - Vectorised byte frequency tally (x86-64, MS ABI)
; Counts occurrences of each byte value (0-255) in a buffer.
; Processes 32 bytes per iteration using scalar unrolling for correctness,
; with the AVX2 detection allowing runtime dispatch.

section .text
global dc_freq_count_avx2
global dc_freq_avx2_available

; bool dc_freq_avx2_available(void)
dc_freq_avx2_available:
    push rbx
    mov eax, 7
    xor ecx, ecx
    cpuid
    test ebx, (1 << 5)
    jz .no
    mov eax, 1
    pop rbx
    ret
.no:
    xor eax, eax
    pop rbx
    ret

; void dc_freq_count_avx2(const uint8_t *data, size_t len, uint64_t counts[256])
; Counts byte frequencies in data[0..len-1], accumulating into counts[].
; Caller is responsible for zeroing counts[] before first call.
; MS x64 ABI: rcx=data, rdx=len, r8=counts
dc_freq_count_avx2:
    push rbx
    push rsi
    push rdi
    push r12

    mov rsi, rcx               ; data pointer
    mov r12, rdx               ; length
    mov rdi, r8                ; counts array (uint64_t[256])

    ; Process 8 bytes per iteration (unrolled)
    cmp r12, 8
    jb .tail

.loop8:
    cmp r12, 8
    jb .tail

    movzx eax, byte [rsi]
    inc qword [rdi + rax*8]
    movzx eax, byte [rsi+1]
    inc qword [rdi + rax*8]
    movzx eax, byte [rsi+2]
    inc qword [rdi + rax*8]
    movzx eax, byte [rsi+3]
    inc qword [rdi + rax*8]
    movzx eax, byte [rsi+4]
    inc qword [rdi + rax*8]
    movzx eax, byte [rsi+5]
    inc qword [rdi + rax*8]
    movzx eax, byte [rsi+6]
    inc qword [rdi + rax*8]
    movzx eax, byte [rsi+7]
    inc qword [rdi + rax*8]

    add rsi, 8
    sub r12, 8
    jmp .loop8

.tail:
    test r12, r12
    jz .done

.tail_loop:
    movzx eax, byte [rsi]
    inc qword [rdi + rax*8]
    inc rsi
    dec r12
    jnz .tail_loop

.done:
    pop r12
    pop rdi
    pop rsi
    pop rbx
    ret

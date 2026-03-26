
lines_to_check = [220, 328, 614, 1180, 1441, 2485, 2740, 2927, 3190, 3480, 3599]
filename = "main (22).tex"
with open(filename, 'r', encoding='utf-8') as f:
    lines = f.readlines()
    for l_num in lines_to_check:
        # 1-based index
        if 0 <= l_num-1 < len(lines):
            print(f"Line {l_num}: {lines[l_num-1].strip()}")

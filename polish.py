# Hand-finishing of the generated base (out/ascii.txt from run.mjs): explicit overwrites at (row, col).
# Every edit is listed here so the final art stays reproducible from the three.js output.
import sys

src = sys.argv[1] if len(sys.argv) > 1 else 'out/ascii.txt'
dst = sys.argv[2] if len(sys.argv) > 2 else 'out/polished.txt'
rows = open(src).read().rstrip('\n').split('\n')


def put(r, c, s):
    while len(rows) <= r:
        rows.append('')
    line = rows[r].ljust(c + len(s))
    rows[r] = line[:c] + s + line[c + len(s):]


def clear(r, c0, c1):
    put(r, c0, ' ' * (c1 - c0 + 1))


# Tail: close the gap in the top contour.
clear(0, 0, 40)
put(1, 12, '-')

# Ear tuft (one clean diagonal) and a pointed ear.
put(5, 40, ' \\')
put(6, 41, ' \\')
put(7, 42, ' \\ ')
put(8, 42, ' /\\ ')
put(9, 41, ' /..\\ ')
put(10, 41, '/...:|__')
put(11, 40, '.\'....\'  \'--._')

# Head: fill the highlight hole, finish the top-right contour.
put(12, 45, '...')
put(12, 56, '-.')
put(13, 58, '\\')

# Nose and whiskers.
put(15, 59, '\\.   ')
put(16, 59, 'o--  ')
put(17, 59, '\'--  ')

# Paw gripping the glass.
put(25, 42, '\\....\\.__    |')
put(26, 40, '........(__)  .|')
put(27, 43, '   |  .     |')

# Label on the Stange; straight left edge where the thigh meets the glass.
put(30, 46, '| KÖLSCH ')
put(33, 46, '|')

# Stange: straight base and a rounded glass bottom.
put(35, 46, '|________|')
put(36, 46, "'--------'")

rows = [r.rstrip() for r in rows]
while rows and not rows[0]:
    rows.pop(0)
open(dst, 'w').write('\n'.join(rows) + '\n')
print('\n'.join(rows))

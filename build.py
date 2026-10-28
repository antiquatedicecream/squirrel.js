# Builds the deliverables from the polished art:
#   final/squirrel-koelsch.txt        plain ASCII
#   final/squirrel-koelsch-prost.txt  with a "Prost!" speech bubble
#   final/gmail.html                  standalone page: preview + "copy for Gmail" (monospace HTML, optional colour)
import json
import os

art = open('out/polished.txt').read().rstrip('\n').split('\n')
# zones.txt belongs to out/ascii.txt; polish.py dropped the base's (cleared) first row.
zones = open('out/zones.txt').read().rstrip('\n').split('\n')[1:]

BUBBLE = [(1, 50, ".---------."), (2, 49, "(  Prost!   )"), (3, 50, "`---------'"), (4, 51, "/"), (5, 50, "'")]

# First glass column per row; further left the arm and paw overlap the Stange.
GLASS_LEFT = {21: 48, 22: 46, 23: 48, 24: 51, 25: 52, **{r: 46 for r in range(26, 36)}}


def colour_class(r, c, ch):
    if ch == ' ':
        return ' '
    z = zones[r][c] if r < len(zones) and c < len(zones[r]) else ' '
    if 3 <= r <= 6 and 40 <= c <= 43:
        return 'U'                                   # ear tuft
    if r == 15 and c == 59:
        return 'N'                                   # nose
    if r in (15, 16) and c >= 59:
        return 'W'                                   # whiskers
    if r == 25 and 48 <= c <= 51:
        return 'P'                                   # paw
    if r in GLASS_LEFT and GLASS_LEFT[r] <= c <= 55:
        if c in (46, 55) or r in (21, 34, 35):
            return 'G'                               # glass outline and base
        if r == 22:
            return 'O'                               # foam
        if r == 29 and 48 <= c <= 53:
            return 'L'                               # label
        return 'Y'                                   # beer
    if z == 'T':
        return 'T'
    if z == '@':
        return 'E'
    if z == 'n':
        return 'N'
    if z == 'p':
        return 'P'
    return 'F'


def with_bubble(lines):
    rows = list(lines)
    for r, c, s in BUBBLE:
        line = rows[r].ljust(c + len(s))
        rows[r] = line[:c] + s + line[c + len(s):]
    return [x.rstrip() for x in rows]


def classes(lines, bubble=False):
    out = []
    for r, line in enumerate(lines):
        row = ''.join(colour_class(r, c, ch) for c, ch in enumerate(line))
        if bubble:
            row = list(row.ljust(len(line)))
            for br, bc, s in BUBBLE:
                if br == r:
                    for k, ch in enumerate(s):
                        if ch != ' ':
                            row[bc + k] = 'S'
            row = ''.join(row)
        out.append(row)
    return out


plain = [x.rstrip() for x in art]
prost = with_bubble(plain)
os.makedirs('final', exist_ok=True)
open('final/squirrel-koelsch.txt', 'w').write('\n'.join(plain) + '\n')
open('final/squirrel-koelsch-prost.txt', 'w').write('\n'.join(prost) + '\n')

data = {
    'plain': {'lines': plain, 'classes': classes(plain)},
    'prost': {'lines': prost, 'classes': classes(prost, bubble=True)},
}
template = open('gmail.template.html').read()
open('final/gmail.html', 'w').write(template.replace('/*DATA*/null', json.dumps(data, ensure_ascii=False)))
print('wrote final/squirrel-koelsch.txt, final/squirrel-koelsch-prost.txt, final/gmail.html')
print(f'{len(plain)} lines x {max(map(len, plain))} columns')

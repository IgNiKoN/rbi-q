import re,sys,json
f='js/modules/settings/settings.render.js'
L=open(f,encoding='utf-8').read().split('\n')
src='\n'.join(L[25:1553])
off=[0]
for l in L[25:1553]: off.append(off[-1]+len(l)+1)
import bisect
ln=lambda o:26+bisect.bisect_right(off,o)-1
out=[]
for m in re.finditer(r'<(button|input|select|textarea|a)\s([^>]*)>',src,re.S):
    tag,attrs=m.groups()
    if 'display:none' in attrs.replace(' ','') or 'type="hidden"' in attrs: continue
    g=lambda n:(re.search(r'\b'+n+r'="([^"]*)"',attrs) or [None,''])[1]
    if tag in('button','a','textarea'):
        end=src.find('</'+tag+'>',m.end()); inner=src[m.end():end]
        lab=re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',inner)).strip()
    elif tag=='select':
        lab=''
    else:
        lab=re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',src[m.end():m.end()+300])).strip()[:40] if g('type') in('radio',) else ''
    if not lab or tag in('select','input'):
        before=src[max(0,m.start()-1500):m.start()]
        labs=re.findall(r'data-i18n="([^"]*)"[^>]*>([^<]{2,})<',before)
        labs=[x for x in labs if not x[0].startswith('settings.opt')]
        if labs: lab=(lab+' ' if lab else '')+'«'+labs[-1][1].strip()+'»' if tag!='input' or g('type')!='radio' else lab
    ident=g('id') or g('data-settings-action') or g('data-action') or g('data-reports-action') or g('data-game-action') or g('data-settings-subsection') or g('onclick')[:45] or g('href')
    out.append((ln(m.start()),tag+('/'+g('type') if g('type') and tag=='input' else ''),ident,lab[:60]))
json.dump(out,open(sys.argv[1],'w'),ensure_ascii=False)
for o in out: print('\t'.join(map(str,o)))
print(len(out))

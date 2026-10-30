# GHID REMEDIERE UX — DosarFonduri v2
## Referință pentru DUPĂ audit — pattern-uri corecte

**Acest document NU se dă lui Claude Code în faza de audit.**
**Se folosește DUPĂ ce ai rezultatul auditului, pentru a fixa problemele găsite.**

---

## Layout Corect (scroll pe conținut)

```tsx
// (app)/layout.tsx — PATTERN CORECT
<div className="h-screen flex flex-col overflow-hidden">
  <Topbar />                                    {/* h-14, fix */}
  <div className="flex flex-1 overflow-hidden">
    <Sidebar />                                  {/* w-60, fix */}
    <main className="flex-1 overflow-hidden flex flex-col">
      {children}                                 {/* fiecare pagină gestionează propriul scroll */}
    </main>
  </div>
</div>
```

```tsx
// Orice pagină — PATTERN CORECT
export default function Page() {
  return (
    <div className="flex flex-col h-full">
      {/* Header pagină — FIX */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <h1 className="text-xl font-semibold">Titlu Pagină</h1>
        <Button>+ Acțiune</Button>
      </div>
      {/* Conținut — SCROLLABIL */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* ... */}
      </div>
    </div>
  );
}
```

```tsx
// Split pane (Firme, Documente) — PATTERN CORECT
<div className="flex h-full">
  <div className="w-80 border-r overflow-y-auto">   {/* Lista — scroll propriu */}
    {lista}
  </div>
  <div className="flex-1 overflow-y-auto">          {/* Detaliu — scroll propriu */}
    {detaliu}
  </div>
</div>
```

---

## Ierarhia Butoanelor

```
Primary:     bg-slate-900 text-white rounded-lg px-4 py-2.5 text-sm font-medium
Accent:      bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium
Secondary:   bg-white border border-slate-200 text-slate-700 rounded-lg px-4 py-2.5 text-sm font-medium
Ghost:       bg-transparent text-slate-600 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-slate-100
Danger:      bg-red-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium
Disabled:    opacity-50 cursor-not-allowed

Butoanele rămân la text-sm (14px) — sunt elemente de acțiune, nu de citit.
```

---

## Paletă Culori

```
Background:        white
Surface (cards):   white + border border-slate-200
Sidebar:           bg-white border-r border-slate-200 text-slate-600
Sidebar activ:     bg-slate-100 text-slate-900 font-medium
Text primary:      text-slate-900
Text secondary:    text-slate-500
Text muted:        text-slate-400
Border:            border-slate-200
Accent:            blue-600
Success:           emerald-600
Warning:           amber-500
Danger:            red-600
```

---

## Status Badges

```
Activ:       bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5 text-xs font-medium
În lucru:    bg-amber-50 text-amber-700 border border-amber-200
Eroare:      bg-red-50 text-red-700 border border-red-200
Neutru:      bg-slate-50 text-slate-600 border border-slate-200
Info:        bg-blue-50 text-blue-700 border border-blue-200
```

---

## Tipografie

```
Page title:     text-xl font-semibold text-slate-900     (20px)
Section title:  text-lg font-semibold text-slate-900     (18px)
Card title:     text-base font-medium text-slate-900     (16px)
Body:           text-base text-slate-700                 (16px)
Caption/Meta:   text-sm text-slate-500                   (14px)
Tabel rows:     text-sm text-slate-700                   (14px — densitate)
Badges/Tags:    text-xs font-medium                      (12px — decorative)
Mono (code):    text-sm font-mono text-slate-600         (14px)

Solomon mesaje:     text-base leading-relaxed            (16px — confort sesiuni lungi)
Solomon input:      text-base                            (16px — match cu mesajele)
Solomon extracții:  text-sm font-mono                    (14px — date structurate)
Elemente panel:     text-sm (labels), text-base (valori) (14/16px)
```

**Principiu:** Body și caption cresc cu o treaptă față de standardul SaaS (14→16, 12→14).
Titlurile rămân — diferența ierarhică se menține prin font-weight.
Tabelele și badges rămân mici — au nevoie de densitate.

---

## Inputs & Formulare

```
Input:       h-11 rounded-lg border border-slate-200 px-3 text-base
             focus:ring-2 focus:ring-blue-500 focus:border-blue-500
Label:       text-sm font-medium text-slate-700 mb-1.5
Error:       border-red-500 + text-sm text-red-600 mt-1
Placeholder: text-slate-400 text-base
```

---

## Spacing Standard

```
Padding pagină:           p-6
Gap între secțiuni:       gap-6 / space-y-6
Gap în carduri:           gap-4
Gap header (titlu+btn):   flex justify-between items-center
Margin titlu secțiune:    mb-4
Card padding:             p-5
Card border-radius:       rounded-lg
Card shadow:              shadow-sm (max)
```

---

## Tabs

```
Container:    border-b border-slate-200
Tab activ:    border-b-2 border-blue-600 text-blue-600 font-medium text-sm pb-3
Tab inactiv:  text-slate-500 hover:text-slate-700 font-medium text-sm pb-3
Gap tabs:     gap-6
```

---

## Empty State

```tsx
<div className="flex flex-col items-center justify-center py-16 text-center">
  <IconComponent className="w-12 h-12 text-slate-300 mb-4" />
  <h3 className="text-base font-medium text-slate-900 mb-1">Niciun proiect încă</h3>
  <p className="text-sm text-slate-500 mb-4">Creează primul proiect pentru a începe.</p>
  <Button>+ Proiect Nou</Button>
</div>
```

---

## Tabel Standard

```
Header:      text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50/80
Row:         text-sm hover:bg-slate-50 border-b border-slate-100
Row click:   cursor-pointer
Acțiuni:     dropdown ⋮ (not inline buttons)
```

---

## Solomon Chat — Pattern-uri Corecte (referință: claude.ai)

### Layout Solomon (split pane)

```tsx
// Solomon tab — PATTERN CORECT
<div className="flex h-full">
  {/* Chat area — 65-70% */}
  <div className="flex-1 flex flex-col min-w-0">
    {/* Mesaje — scroll propriu, centrate */}
    <div className="flex-1 overflow-y-auto" ref={messagesRef}>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {messages.map(msg => <Message key={msg.id} {...msg} />)}
        {isStreaming && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
    {/* Input — fix la fund */}
    <div className="border-t bg-white p-4">
      <div className="max-w-3xl mx-auto">
        <ChatInput />
      </div>
    </div>
  </div>
  {/* Elemente panel — 30-35%, scroll propriu */}
  <div className="w-80 border-l flex flex-col">
    <div className="px-4 py-3 border-b flex items-center justify-between">
      <span className="text-sm font-medium">Elemente</span>
      <span className="text-xs text-slate-500">78/120</span>
    </div>
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {elements.map(el => <ElementCard key={el.id} {...el} />)}
    </div>
  </div>
</div>
```

### Mesaje (stil claude.ai)

```tsx
// Mesaj Solomon — fără background, aliniat stânga, max-width
<div className="flex gap-3">
  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500
                  flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
    S
  </div>
  <div className="flex-1 min-w-0 text-base text-slate-700 leading-relaxed">
    {content}
  </div>
</div>

// Mesaj User — background subtil, aliniat stânga ca pe claude.ai
<div className="flex gap-3">
  <div className="w-7 h-7 rounded-full bg-slate-200
                  flex items-center justify-center text-slate-600 text-xs font-bold flex-shrink-0">
    {userInitial}
  </div>
  <div className="flex-1 min-w-0 bg-slate-50 rounded-2xl px-4 py-3 text-base text-slate-900">
    {content}
  </div>
</div>

// Spacing între mesaje: space-y-6 (24px — generos, ca pe claude.ai)
```

### Textarea Input (stil claude.ai)

```tsx
// PATTERN CORECT — textarea auto-resize, nu input
<div className="relative flex items-end gap-2 rounded-2xl border border-slate-200
                bg-white px-4 py-3 focus-within:ring-2 focus-within:ring-blue-500">
  <button className="p-1.5 text-slate-400 hover:text-slate-600 flex-shrink-0">
    <PaperclipIcon className="w-5 h-5" />
  </button>
  <textarea
    ref={inputRef}
    rows={1}
    className="flex-1 resize-none text-base leading-relaxed bg-transparent
               outline-none placeholder:text-slate-400 max-h-[150px] overflow-y-auto"
    placeholder="Scrie detalii despre proiect, lipește date, sau întreabă..."
    value={input}
    onChange={(e) => {
      setInput(e.target.value);
      // Auto-resize
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
    }}
    onKeyDown={(e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    }}
  />
  <button
    className={`p-1.5 rounded-lg flex-shrink-0 transition-colors ${
      input.trim()
        ? 'bg-slate-900 text-white hover:bg-slate-800'
        : 'text-slate-300 cursor-not-allowed'
    }`}
    disabled={!input.trim() || isStreaming}
    onClick={handleSend}
  >
    {isStreaming ? <StopIcon className="w-5 h-5" /> : <SendIcon className="w-5 h-5" />}
  </button>
</div>
```

### Auto-scroll inteligent (ca pe claude.ai)

```tsx
const messagesRef = useRef<HTMLDivElement>(null);
const bottomRef = useRef<HTMLDivElement>(null);
const [autoScroll, setAutoScroll] = useState(true);

// Detectează dacă user-ul a scrollat manual în sus
const handleScroll = () => {
  const el = messagesRef.current;
  if (!el) return;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  setAutoScroll(atBottom);
};

// Scroll la fund când vine mesaj nou (doar dacă autoScroll = true)
useEffect(() => {
  if (autoScroll) {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }
}, [messages, autoScroll]);
```

### Typing Indicator (stil claude.ai)

```tsx
<div className="flex gap-3">
  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500
                  flex items-center justify-center text-white text-xs font-bold">S</div>
  <div className="flex items-center gap-1 py-3">
    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
  </div>
</div>
```

### Card Extracție Solomon

```tsx
<div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/50 p-3 space-y-2">
  <div className="flex items-center justify-between">
    <span className="text-xs font-medium text-slate-500">{label}</span>
    <span className="text-xs text-slate-400">din {source}</span>
  </div>
  <div className="text-sm font-medium font-mono text-slate-900">{value}</div>
  <div className="flex gap-2 pt-1">
    <button className="px-3 py-1.5 text-xs font-medium rounded-lg
                       bg-emerald-600 text-white hover:bg-emerald-700">
      Confirmă
    </button>
    <button className="px-3 py-1.5 text-xs font-medium rounded-lg
                       border border-slate-200 text-slate-600 hover:bg-slate-50">
      Respinge
    </button>
  </div>
</div>
```

### Element Card (panoul dreapta)

```tsx
// Element confirmat
<div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-emerald-50/50">
  <CheckCircleIcon className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
  <div className="min-w-0">
    <div className="text-xs text-slate-500">{label}</div>
    <div className="text-sm font-medium text-slate-900 truncate">{value}</div>
  </div>
</div>

// Element propus (neconfirmat)
<div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50/50">
  <AlertCircleIcon className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
  <div className="min-w-0">
    <div className="text-xs text-slate-500">{label}</div>
    <div className="text-sm font-medium text-slate-900 truncate">{value}</div>
  </div>
</div>

// Element gol
<div className="flex items-start gap-2 px-3 py-2 rounded-lg">
  <CircleIcon className="w-4 h-4 text-slate-300 mt-0.5 flex-shrink-0" />
  <div className="text-xs text-slate-400">{label}</div>
</div>
```

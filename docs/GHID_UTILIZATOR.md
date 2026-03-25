# DosarFonduri — Ghid Utilizator

## Ce este DosarFonduri?

DosarFonduri este o platformă pentru consultanții de fonduri europene nerambursabile care automatizează pregătirea dosarelor de finanțare. Platforma extrage reguli din ghiduri, verifică eligibilitatea, completează formulare automat cu ajutorul inteligenței artificiale și generează documentele necesare.

**Flux de lucru tipic:**
1. Creezi structura (Program → Măsură → Sesiune) în **Documente**
2. Încarci ghidul de finanțare → AI extrage regulile de eligibilitate
3. Încarci template-urile de formulare → AI detectează câmpurile
4. Adaugi firma în **Firme** (automat prin CUI sau manual prin ONRC PDF)
5. Creezi un **Proiect** legat de firmă și sesiune
6. Lucrezi în proiect: verifici eligibilitatea, completezi elemente, generezi documente

---

## Pagini și capabilități

### 1. Autentificare (Login)

Pagina de autentificare pentru utilizatorii cabinetului de consultanță.

**Ce poți face:**
- Autentificare cu email și parolă
- Creare cont nou (necesită cod de invitație de la provider)
- Resetare parolă prin email

---

### 2. Panou de Control (Dashboard)

Pagina principală după autentificare — rezumatul activității cabinetului.

**Ce vezi:**
- Număr total de firme, proiecte active, documente, rată de succes
- Proiecte recente cu progresul lor (eligibilitate, elemente, checklist)
- Termene limită apropiate
- Jurnal de activitate recentă

**Ce poți face:**
- Navigare rapidă: Adaugă Firmă, Proiect Nou, Documente
- Click pe un proiect pentru a-l deschide direct

---

### 3. Firme

Gestionarea firmelor / entităților juridice din portofoliul cabinetului.

**Ce vezi:**
- Lista firmelor cu forma juridică, CUI, CAEN, categorie IMM, status
- Filtre: Toate, Active, Societăți, PF/II/IF
- Căutare după nume, CUI, CAEN, județ

**Ce poți face:**
- **Adaugă firmă automat:** Introduci CUI → sistemul caută în ListaFirme/ONRC și completează totul
- **Adaugă firmă manual:** Încarci PDF ONRC → AI extrage datele (asociați, administratori, sediu, CAEN)
- **Deschide fișa firmei:** Date generale, ONRC, financiar, elemente, pre-eligibilitate

**Pagina de detaliu firmă (taburi):**
- **General:** Date de bază (CUI, formă juridică, CAEN, adresă, data înființării)
- **Date ONRC:** Asociați PF/PJ, administratori, membrii IF, activități secundare
- **Financiar:** Upload bilanț ANAF → AI extrage cifra de afaceri, profit, angajați, capital pe ani
- **Elemente:** Biblioteca de elemente ale firmei (editabile, cu categorii)
- **Eligibilitate solicitant:** Pre-verificare eligibilitate pe sesiune (regulile din ghid vs datele firmei)

---

### 4. Documente

Structura ierarhică de foldere și gestiunea documentelor.

**Structură:** Program → Măsură → Sesiune → 4 foldere automate (Ghiduri, Template-uri, Clienți Prospecți, Clienți Finali)

**Ce poți face:**
- **Crează structura:** Click dreapta pe un nod → Adaugă sub-nivel
- **Încarcă documente:** Drag & drop sau buton în folderele finale
- **Procesare AI automată** (depinde de folder):
  - *Ghiduri* → Extrage reguli de eligibilitate (fixe + interpretate) și criterii de punctare
  - *Template-uri* → Detectează câmpurile formularelor (text, checkbox, tabel, etc.)
  - *Clienți* → Extrage date din facturi, contracte, CI, certificate, bilanțuri
- **Vizualizare status:** Verde = procesat, Galben = în procesare, Roșu = eroare
- **Reprocesare:** Re-rulează extracția AI pe un document existent
- **Ștergere document:** Cu cleanup automat al fișierelor din storage

---

### 5. Template Viewer

Vizualizare și configurare template de formular.

**Ce vezi:**
- Preview PDF al template-ului cu elemente detectate evidențiate
- Lista de elemente (câmpuri) grupate pe pagini, cu status validare

**Ce poți face:**
- **Validează elemente:** Marchează câmpurile ca verificate (individual sau pe pagină)
- **Adaugă elemente manual:** Creează câmpuri noi (text, număr, dată, tabel, semnătură)
- **Editează elemente:** Schimbă eticheta, tipul, grupul
- **Șterge elemente:** Elimină câmpuri nedorite
- **Configurare Compose (dacă e activ):** Definește secțiuni narative pentru generare AI

---

### 6. Proiecte (listă)

Tabloul de bord al tuturor proiectelor din cabinet.

**Ce vezi:**
- Carduri cu: nume proiect, firmă, program, status, valoare, scor punctaj
- Metrici progres: Eligibilitate (X/Y), Elemente (X/Y), Documente (X/Y)
- Indicator de blocare dacă alt utilizator editează proiectul (badge amber cu lacăt)

**Ce poți face:**
- **Creează proiect nou:** Nume → Selectează firmă → Selectează sesiune → Confirmare
- **Caută și filtrează:** După nume, firmă, status (Draft / În Progres / Review / Depus)
- **Sortare:** După dată, nume, sau valoare
- **Șterge proiect:** Cu confirmare (nu se pot șterge proiecte depuse/aprobate)

---

### 7. Proiect (detaliu)

Spațiul de lucru complet pentru un dosar de finanțare. Navigare prin sidebar arbore cu 6 secțiuni.

#### 🛡 Eligibilitate
- Lista regulilor de eligibilitate extrase din ghid (trecute / picate / în așteptare)
- Per regulă: condiție, elemente legate, status, note override
- **Acțiuni:** Validare reguli, override manual (cu justificare), re-evaluare automată la modificarea elementelor

#### 📖 Ghid Finanțare
- Regulile extrase din documentul ghid, grupate pe categorii
- Tip regulă: fixă (evaluare automată) vs interpretată (evaluare AI)
- Scor de încredere, pagina sursă din ghid
- **Acțiuni:** Vizualizare reguli, validare interpretări

#### 🤖 Solomon (Chat AI)
- Asistent AI conversațional pentru întrebări despre eligibilitate, completare dosar
- Selector model: Haiku (rapid, ieftin) / Sonnet (echilibrat) / Opus (complex, scump)
- Toggle Extended Thinking pentru analiză profundă
- Upload fișiere direct în chat (PDF, imagine, DOCX)
- **Acțiuni:** Întrebări libere, upload documente, extracția automată a elementelor din răspunsuri

#### 📊 Elemente
- Biblioteca de elemente ale proiectului (câmpuri necesare în formulare)
- Categorii: Beneficiar, Investiție, Selecție, Financiar, etc.
- Status: Confirmat, Propus AI, Gol, Conflict
- **Acțiuni:** Editare valori, confirmare/respingere propuneri AI, căutare, filtrare

#### 📋 Checklist Documente
- Lista documentelor necesare pentru dosar (extrasă din ghid)
- Per item: nume, categorie, status (bifat/nebifat), note, link template
- **Acțiuni:** Bifare documente completate, adăugare note, reîmprospătare din ghid

#### 📄 Neemia (Generare Documente)
- Template-urile disponibile pentru generare cu progresul de completare
- Două moduri: Fill (completare câmpuri) și Compose (generare narativă AI)
- Versiuni anterioare vizibile cu timestamp
- **Acțiuni:** Generare document, descărcare DOCX/XLSX/PDF, generare în masă, selectare model AI

---

### 8. Configurări

Setările cabinetului — AI, integrări, branding, notificări.

**Secțiuni:**
- **Solomon:** Model AI implicit, Extended Thinking, prag review
- **Neemia:** Model pentru generare documente, setări compose
- **Ghid Finanțare:** Modele pentru reguli fixe și interpretate
- **Bază de Cunoștințe:** Legislație, bune practici, corecții, praguri (adaugă/editează/șterge)
- **Integrare API:** Chei API pentru ListaFirme, ONRC, ANAF (testare, activare/dezactivare)
- **Branding Documente:** Logo, culori, font, watermark, format numere (RO/EN)
- **Notificări:** Alerte email pentru elemente noi, eșecuri eligibilitate, template gata, termene

---

### 9. Admin

Panoul de administrare al cabinetului (doar pentru rolul Admin).

**Taburi:**
- **Utilizatori:** Invitare consultanți, schimbare rol (Admin/Consultant/Vizualizator), activare/dezactivare conturi
- **Costuri AI:** Distribuție costuri pe agent (Solomon, Neemia, OCR), pe model, tendințe utilizare
- **Jurnal Activitate:** Log cronologic al acțiunilor (upload, sync, generare, configurare), filtrabil
- **Export:** Export CSV/JSON pentru proiecte, utilizatori, activitate

---

### 10. Provider Dashboard

Panou de management pentru provider-ul platformei (SaaS admin).

**Secțiuni:**
- **Cabinete:** Lista cabinetelor cu plan, status, utilizatori, venituri (MRR)
- **Coduri Invitație:** Generare coduri cu plan, max utilizatori, perioadă trial, CUI pre-atribuit
- **Utilizatori Platformă:** Toți utilizatorii din toate cabinetele, căutare, dezactivare

---

## Mecanisme de blocare (Lock)

Platforma folosește **blocare pesimistă** pentru a preveni editarea simultană de către mai mulți utilizatori. Există două tipuri de lock:

### Lock Proiect

**Cum funcționează:**
- Când deschizi un proiect, sistemul îl blochează automat pe numele tău
- Alți utilizatori care deschid același proiect văd mesajul: *"Proiectul este deschis de [Nume] — vizualizare doar în citire"*
- Ei pot vizualiza totul dar nu pot modifica nimic (butoane dezactivate)
- Au un buton **"Reîncearcă blocarea"** pentru a prelua lock-ul când devine disponibil

**Expirare automată:** Lock-ul expiră după **30 de minute** de inactivitate. Dacă utilizatorul încă lucrează, sistemul trimite un heartbeat la fiecare 5 minute care prelungește lock-ul.

**Eliberare:** Lock-ul se eliberează automat când:
- Închizi pagina proiectului (navighezi altundeva)
- Închizi tab-ul sau browser-ul
- Expiră cele 30 de minute

**Pe lista de proiecte:** Proiectele blocate de alt utilizator afișează un **badge amber cu lacăt** și numele persoanei care editează. Tooltip-ul arată ora la care a fost blocat.

---

### Lock Structură Foldere (Documente)

**Cum funcționează:**
- Structura de foldere (Program → Măsură → Sesiune) este **blocată implicit** pentru toți utilizatorii
- Dacă vrei să editezi structura (adaugi, redenumești, sau ștergi foldere), apasă pe **iconița lacăt** din header-ul "Structura programe"
- Lock-ul se activează doar pentru tine — ceilalți utilizatori văd: *"[Nume] editează"*
- Ceilalți **nu pot** modifica structura cât timp o ții blocată

**Ce NU blochează:**
- Încărcarea documentelor în foldere existente (funcționează normal pentru toți)
- Crearea proiectelor
- Procesarea documentelor (ghid, template, etc.)
- Navigarea și vizualizarea arborelui de foldere

**Ce blochează:**
- Creare folder nou
- Redenumire folder
- Ștergere folder

**Expirare automată:** Lock-ul expiră după **15 minute** de inactivitate (heartbeat la 5 minute).

**Eliberare:** Apasă din nou pe iconița lacăt sau închide pagina. Admin/Consultant poate forța deblocarea.

**Indicatori vizuali:**
- 🔒 Lacăt gri = structura e blocată (default)
- 🔓 Lacăt albastru = tu editezi structura
- 🔒 + text amber = alt utilizator editează (cu numele lui)

---

### Rezumat Lock-uri

| Aspect | Lock Proiect | Lock Structură Foldere |
|--------|-------------|----------------------|
| **Se activează** | Automat la deschiderea proiectului | Manual (click pe lacăt) |
| **Timeout** | 30 minute | 15 minute |
| **Heartbeat** | La 5 minute | La 5 minute |
| **Scope** | Un singur proiect | Toată structura de foldere (per cabinet) |
| **Vizibilitate** | Banner în proiect + badge pe card | Indicator lacăt + text amber |
| **Force release** | Admin poate prelua | Admin/Consultant poate forța deblocarea |

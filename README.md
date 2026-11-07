# Tavolo D&D 3.5

Tavolo virtuale per la rete di casa: schede dei personaggi, tracker di iniziativa, dadi condivisi, handout e mappe con nebbia di guerra. Non serve installare nulla.

![La mappa vista dal master, con gli strumenti dell'editor](docs/img/mappa-master.png)

| Scheda del personaggio | Combattimento (vista del master) |
| --- | --- |
| ![Scheda del personaggio](docs/img/scheda.png) | ![Tracker di iniziativa](docs/img/combattimento.png) |

| La stessa mappa vista da un giocatore | Dal telefono |
| --- | --- |
| ![Mappa del giocatore con la nebbia di guerra](docs/img/mappa-giocatore.png) | ![Il tavolo sul telefono](docs/img/telefono.png) |

## Avvio

Doppio clic su **`TavoloDnD.exe`**: si apre la finestra del tavolo, come un normale programma, senza console e senza schede del browser. Chiudendo la finestra il tavolo si spegne (e salva). Un secondo doppio clic riporta in primo piano la finestra già aperta.

L'exe è un file solo che contiene tutto, quindi puoi copiarlo su qualsiasi PC Windows. All'avvio impiega qualche secondo perché si scompatta. I dati vengono salvati in `data.json` **nella stessa cartella dell'exe**.

Il pulsante **📡 Giocatori** in alto (e la pagina di accesso) mostra gli indirizzi da dare ai giocatori, per esempio `http://192.168.1.20:3000`. I giocatori li aprono nel browser del telefono o del PC, sulla stessa rete. Lo stesso riquadro mostra il **PIN del master** appena creato e ha il pulsante **Nuovo PIN del master** se lo hai dimenticato. Queste informazioni si vedono solo sul PC che ospita il tavolo.

La prima volta Windows chiede di consentire TavoloDnD nel firewall: accetta per le **reti private**, altrimenti i giocatori non si collegano.

L'exe non è nel repository: va creato (vedi sotto) la prima volta su ogni computer e dopo ogni modifica al codice.

## Creare l'exe

Serve [Node.js](https://nodejs.org) (versione 22 o successiva) installato sul PC dove crei l'exe; chi poi usa l'exe non ne ha bisogno.

1. **Chiudi il tavolo** se è acceso (la finestra di TavoloDnD), altrimenti l'exe non si può sovrascrivere.
2. Apri PowerShell nella cartella del progetto (in Esplora file: clic destro sulla cartella → *Apri nel terminale*).
3. La prima volta installa i componenti:
   ```
   npm install
   ```
4. Poi crea l'exe:
   ```
   npm run build
   ```
5. Alla fine compare `Creato TavoloDnD.exe`: il file è nella cartella del progetto, accanto a `data.json`.

La prima volta serve internet: si scaricano React, Vite ed Electron (qualche centinaio di MB, una volta sola).

Scorciatoia: `aggiorna.cmd` fa tutto da solo (scarica l'ultima versione da GitHub, installa i componenti e crea l'exe).

Cosa succede dietro (`build.js`):
1. Vite compila l'interfaccia React (`src/`) in un file solo, `dist/index.html`.
2. electron-builder mette quel file, il server (`server.js`) e la finestra (`electron/main.js`) dentro `TavoloDnD.exe`.

L'exe pesa circa 110 MB perché contiene Electron, cioè Chromium e Node.

### Provare le modifiche

- `npm run app`: la finestra del tavolo senza creare l'exe.
- `npm start`: solo il server, senza finestra; poi apri http://localhost:3000 nel browser.
- `npm run dev` insieme a `npm start`: l'interfaccia si aggiorna da sola a ogni modifica, su http://localhost:5173.
- `npm test`: i controlli automatici.

Com'è fatto:
- `server.js`: il server, senza dipendenze: account, schede, dadi, mappe, e cosa vede ciascuno.
- `src/`: l'interfaccia React, cioè le schermate in `components/`, le regole 3.5 in `rules.js` e le mappe in `map/`.
- `electron/main.js`: la finestra.

## Lavorare su più computer

Il codice è in un repository git; `data.json` e `TavoloDnD.exe` restano fuori (i dati contengono account e PIN, l'exe si ricrea).

- **Su un nuovo computer** (servono [Git](https://git-scm.com) e [Node.js](https://nodejs.org)): `git clone <indirizzo del repository>`, poi doppio clic su `aggiorna.cmd` per creare l'exe.
- **Dopo aver modificato il codice**: `git add -A`, `git commit -m "cosa ho cambiato"`, `git push`.
- **Per prendere le modifiche fatte altrove**: chiudi il tavolo e fai doppio clic su `aggiorna.cmd` (scarica e ricrea l'exe).
- **Per spostare anche le partite**: copia a mano `data.json` accanto all'exe sull'altro PC.

## Uso

- **Giocatori**: aprono l'indirizzo, scelgono nome + PIN (l'account si crea al primo accesso), creano e compilano la propria scheda. Le schede altrui si vedono in sola lettura.
- **Master**: entra come `Master`; modifica tutte le schede, assegna una scheda a un giocatore, gestisce il combattimento (PNG nascosti, PF dei PNG visibili solo a lui), tira dadi segreti, scrive note private e pubblica handout: a tutti, oppure in privato a un solo giocatore o a un gruppo (gli altri non lo ricevono proprio).
- **Ritratto**: clic sul riquadro a sinistra della scheda per scegliere un'immagine (dal PC o dal telefono). Viene ritagliata e rimpicciolita da sola, e il centro compare anche sul segnalino in mappa.
- **Storia**: il master scrive la storia della campagna; sotto, chiunque aggiunge un **Nuovo riepilogo** per raccontare cosa è successo. Ognuno modifica i suoi, il master tutti.
- **Mostri e PNG** (solo il master): **+ Mostro / PNG nascosto** nelle Schede crea una scheda che i giocatori non vedono affatto: niente scheda, niente segnalino, niente riga nel combattimento. Il master la mette in mappa quando vuole e la rivela con 👁 (nell'elenco delle schede o negli strumenti Personaggi della mappa). Con "statistiche nascoste" i giocatori vedono il segnalino ma non i numeri.
- **Campagne**: in alto il master sceglie la campagna in gioco (▶), ne crea di nuove o la rinomina. Ogni campagna ha le sue schede, il suo combattimento, il suo log dei dadi, i suoi handout e le sue note; gli account restano gli stessi in tutte le campagne. I giocatori possono sfogliare le altre campagne e aggiornare lì i propri personaggi; quando il master cambia la campagna in gioco, tutti tornano su quella.
- **Mappe**: il master le disegna a tasselli di 15 m (fino a 40 per lato) con pennello, porte, finestre, scale, arredi e natura, anche su più piani (il piano sopra o sotto si può vedere in trasparenza). Le mostra ai giocatori quando vuole; i segnalini occupano lo spazio della taglia del personaggio, ognuno muove il suo. Le note con freccia e la **nebbia di guerra** si accendono e spengono dal master: ai giocatori arriva solo ciò che è stato rivelato. Un corridoio si può spostare nel suo tassello (in alto, in basso, a destra, a sinistra): le stanze vicine aprono il passaggio dove arriva, e due corridoi spostati in modo diverso si raccordano con un gomito. Ognuno può accendere o spegnere la **griglia** dei quadretti (▦ Griglia) e regolarne la trasparenza. Scorciatoie: tasti 1–6 per gli strumenti, Ctrl+Z annulla, Ctrl+rotella zoom, clic destro cancella.
- **Backup** (💾 in alto): tutti, giocatori compresi, possono scaricare un file con tutte le campagne (segreti del master compresi; gli account ci sono ma senza PIN). Così una copia c'è anche se il PC del tavolo si rompe. Il master lo ripristina con **Ripristina da file…**: per ogni campagna del file vede se è già sul tavolo (stessa campagna, anche se rinominata) o è una campagna diversa. La stessa campagna si sovrascrive (dopo una conferma) oppure si aggiunge come copia; una campagna diversa si aggiunge. Prima di sovrascrivere, i dati di adesso vengono copiati in `data-prima-del-ripristino.json`. Un giocatore del backup che sul tavolo non c'è più torna con il suo nome e sceglie un nuovo PIN al primo accesso.
- I tiri si fanno cliccando sui bonus in scheda (TS, abilità, attacchi, caratteristiche) o dal pannello Dadi. Li tira il server, tutti vedono il log.

Tutto è salvato in `data.json` (oltre al 💾 Backup puoi copiare anche questo file). Per ripartire da zero: chiudi il tavolo ed elimina `data.json`.

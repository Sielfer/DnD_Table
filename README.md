# Tavolo D&D 3.5

Tavolo virtuale per la rete di casa: schede dei personaggi, tracker di iniziativa, dadi condivisi, handout. Non serve installare nulla.

## Avvio

Doppio clic su **`TavoloDnD.exe`**: si apre una finestra con gli indirizzi e il browser va sul tavolo. Lascia la finestra aperta durante la partita; chiudendola il tavolo si spegne. L'exe contiene già Node, quindi puoi copiarlo su qualsiasi PC Windows; i dati vengono salvati in `data.json` **nella stessa cartella dell'exe**.

Se modifichi `server.js` o `index.html`, ricrea l'exe con `npm run build` (serve Node e una connessione per scaricare `postject` la prima volta). In alternativa, durante lo sviluppo: `npm start`.

Alla prima partenza la console stampa il **PIN del master** e gli indirizzi da dare ai giocatori (es. `http://192.168.1.20:3000`).
Per scegliere tu il PIN (o reimpostarlo): `$env:MASTER_PIN="1234"; .\TavoloDnD.exe` in PowerShell.

La prima volta Windows chiede di consentire TavoloDnD nel firewall: accetta per le **reti private**, altrimenti i giocatori non si collegano.

## Lavorare su più computer

Il codice è in un repository git; `data.json` e `TavoloDnD.exe` restano fuori (i dati contengono account e PIN, l'exe si ricrea).

- **Su un nuovo computer** (servono [Git](https://git-scm.com) e [Node.js](https://nodejs.org)): `git clone <indirizzo del repository>`, poi doppio clic su `aggiorna.cmd` per creare l'exe.
- **Dopo aver modificato il codice**: `git add -A`, `git commit -m "cosa ho cambiato"`, `git push`.
- **Per prendere le modifiche fatte altrove**: chiudi il tavolo e fai doppio clic su `aggiorna.cmd` (scarica e ricrea l'exe).
- **Per spostare anche le partite**: copia a mano `data.json` accanto all'exe sull'altro PC.

## Uso

- **Giocatori**: aprono l'indirizzo, scelgono nome + PIN (l'account si crea al primo accesso), creano e compilano la propria scheda. Le schede altrui si vedono in sola lettura.
- **Master**: entra come `Master`; modifica tutte le schede, assegna una scheda a un giocatore, gestisce il combattimento (PNG nascosti, PF dei PNG visibili solo a lui), tira dadi segreti, scrive note private e pubblica handout.
- **Campagne**: in alto il master sceglie la campagna in gioco (▶), ne crea di nuove o la rinomina. Ogni campagna ha le sue schede, il suo combattimento, il suo log dei dadi, i suoi handout e le sue note; gli account restano gli stessi in tutte le campagne. I giocatori possono sfogliare le altre campagne e aggiornare lì i propri personaggi; quando il master cambia la campagna in gioco, tutti tornano su quella.
- I tiri si fanno cliccando sui bonus in scheda (TS, abilità, attacchi, caratteristiche) o dal pannello Dadi. Li tira il server, tutti vedono il log.

Tutto è salvato in `data.json` (fai una copia per il backup). Per ripartire da zero: ferma il server ed elimina `data.json`.

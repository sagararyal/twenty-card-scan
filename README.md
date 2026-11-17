# Card Scan

Turn a stack of business cards into clean contacts in [Twenty](https://twenty.com).

Lay the cards down one by one. Each is read in the background, you check what was read, and Card
Scan creates the person and their company, without duplicates.

## How it works

1. **Scan.** Open *Scan business cards* from the command menu. Use the camera page (tap the shutter,
   or turn on *Auto* to take each card when it is sharp and still), or pick photos you already have.
   Add the back of a card if it has one. Zoom and switching camera show when the phone offers them.
2. **Read.** Your workspace's own AI model reads every card on the server. QR codes are decoded too,
   and a vCard on the card wins over the printed text.
3. **Review.** *Scanned cards* lists everything with a status. Open one, check the fields next to the
   photo (unclear ones are marked), optionally *Enrich* the company from its website, and *Create*.
   Tap one or more **lists** when you scan (for example the event) and everyone you save goes on
   those Twenty lists, ready for a Twenty campaign. Your recent lists show as one-tap choices.
4. **Saved for you when clear.** A card with a full name, an email and nothing unclear is saved
   right away. Tick *Also create an opportunity* in review when a card needs one; Card Scan never
   opens one by itself.

People are matched by email and companies by web domain, so a second card from the same person
updates them instead of adding a copy. Existing records are only filled in, never overwritten. A card
with no person on it (a company card) saves just the company. Extensions, a name in a second script and other details go
into a note, so nothing on the card is lost.

## Install

Requires Twenty 2.59 or later. With an AI model turned on in Twenty, cards are read in full.
Without one, the camera page reads them on the phone (**OCR only**): emails, phones and websites
are found, and you fill in name, job title and company in review.

```bash
git clone https://github.com/sagararyal/twenty-card-scan && cd twenty-card-scan
yarn install
twenty auth login --url https://your-twenty.example
twenty app apply --create
```

The camera page is hosted at `https://sagararyal.github.io/twenty-card-scan/camera/` and used by
default. To host your own copy of `camera/index.html`, change **CAMERA_PAGE_URL** in the app's
settings in Twenty.

**Settings** (in the app's settings in Twenty):

| Setting | Default | What it does |
|---|---|---|
| Saving | Auto when clear | `manual` sends every card to review |
| Keep card photos (days) | 365 | `0` keeps them forever |
| CAMERA_PAGE_URL | the hosted page | your own copy of `camera/index.html` |

**Self-hosted Twenty:** set `LOGIC_FUNCTION_TYPE=LOCAL` on the server and the worker. Without it
no card can be read.

## Why a separate camera page

Twenty runs app pages in a sandbox that cannot use the camera. The camera page is a single static
file on its own address. Twenty gives it a code that expires after two hours, and it can only upload
cards with that code. Your login never leaves Twenty.

## Privacy

- **Your cards stay with you and your Twenty.** Photos go straight from your phone to your own Twenty
  and are stored there, on the scanned card and its person.
- **The camera page never sees them.** It is a static file; GitHub only serves the empty page. Your
  Twenty address and the session code sit after `#` in the link, which browsers never send to GitHub.
- **Reading uses your workspace's AI model.** To read a card, your Twenty sends the photo to the model
  set in *Settings › AI* (for example Anthropic or OpenAI). Card Scan has no model or key of its own.
  Choose a self-hosted model if cards must never leave your servers. In OCR only mode the text is
  read on your phone; the OCR engine (Tesseract.js) is downloaded from jsDelivr, the photo is not
  sent anywhere but your Twenty.
- **Websites** are fetched only for public addresses (never your own network), to name a company the
  card left unclear, or when you press *Enrich*.
- **Permissions:** the app can read and update records, upload files and use AI. It cannot delete anything.

## Develop

`yarn typecheck`, `yarn lint`, then `twenty app apply`. Code lives in `src/` (objects, logic
functions, screens) and `camera/` (the camera page).

## License

MIT

# Local app for tracking and projecting income and debts

This app lets you track your debts, as well as project new loans and future income, and see what your payments look like going forward. Your data is entirely yours and lives on your computer, so you won't have to deal with the (in)security of service providers such as clouds or online spreadsheets. Everything is stored in this single folder, so if you want to back up or move your app, you can simply copy the whole folder, and that's it.

## License

Free for non-commercial use under the [PolyForm Noncommercial License 1.0.0](LICENSE). I made this to help people, so it isn't meant to be sold or packaged into a paid product or service. If you want to use it in a way the license doesn't cover, but it helps people, open an issue in this repository and we'll sort it out.

## 1. Install Node.js

1. Go to https://nodejs.org
2. Download the **LTS** version and install it (next, next, finish).
3. To check: open a terminal and type `node -v`. If it shows a version number, you're ready.

## 2. Run the app

1. Open a terminal
2. Move to **this folder** (example: `cd Documents/name-of-this-folder`)
3. Type:

   ```
   node server.js
   ```

4. Open http://localhost:3000 in your browser.

To close the program, go back to the terminal where you started it, and press `Ctrl+C`. You can always restart the app (with step 2) and open localhost in whichever browser you like; your data will be saved, since it is stored automatically in the file `data.json`, which is created on the first run. You don't need to modify anything in the files in this folder.

## Technical: what is in this folder

Personal data is stored in `data.json`; everything else belongs to the app.

| File         | What it does                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data.json`  | **Your data:** loans, income, payments you have ticked off, and your settings (language, currencies). Created automatically on the first run.      |
| `server.js`  | The small local server: serves the app and reads/writes `data.json`. It is what you start with `node server.js`.                                   |
| `index.html` | The app (layout, styles, and the screen logic).                                                                                                    |
| `calc.js`    | The calculations (monthly schedule, how income covers instalments).                                                                                |
| `money.js`   | How amounts are shown (each currency in its own country's format, with its symbol).                                                                |
| `i18n.js`    | The language sheet (every text in the app, per language). To add a language, copy a full block, change the language tag, and translate each value. |

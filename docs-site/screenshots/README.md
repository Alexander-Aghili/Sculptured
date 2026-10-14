# Docs screenshots

`capture.mjs` takes every screenshot in `../images/{quickstart,guides,import}` from the real, running app. Nothing is drawn or mocked. Re-run it after a UI change.

1. Build the app and its web UI: `cargo build -p sculptured && npm --prefix web run build`.
2. Make an empty data folder and a home folder with an `app` folder in it (the demo session "ran" there). Keep the data folder's path short: the agents' tool socket lives in it, and socket paths are limited to about 100 characters.
3. Make the fixture CLI. "Improve this team with AI" asks a CLI, so for the screenshots a stand-in answers with one canned team, and no model is called:

   ```sh
   #!/bin/sh
   [ "$1" = --version ] && echo "fixture 1.0" && exit 0
   cat > /dev/null
   cat /path/to/teams.json   # {"type":"result","structured_output":{"alternatives":[{"label":"team","rationale":"…","team":{…}}]}}
   ```

4. Serve it on a spare port:
   `HOME=<home> target/debug/sculptured serve --port 4499 --data-dir <data> --claude-program <fixture CLI> --codex-program /bin/false`
5. Capture: `npm run screenshots -- --base http://127.0.0.1:4499 --session-folder <home>/app`. Add `--only <step>` to retake one group (`startFrom`, `websiteLaunch`, `manyChildren`, `importSession`). Each run creates its teams again, so start from an empty data folder for a clean sidebar.
6. Look at every image before committing: the state it shows, and nothing personal (only `~/demo/app` paths, made-up teams).

`--base` is required, so the script never drives a Sculptured you actually use. The teams are Practice agents, so no model is called.

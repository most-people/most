Place the recorded voice clips for the game in this folder.

Supported formats: mp3, wav, ogg.

The app looks for the first matching file in this order:

- single-3.mp3 / single-3.wav / single-3.ogg
- pair-7.mp3 / dui-7.mp3 / pair.mp3
- straight-3-4-5.mp3 / straight.mp3 / shunzi.mp3
- pair-straight-3-3-4-4.mp3 / pair-straight.mp3 / liandui.mp3
- bomb-7.mp3 / zha-7.mp3 / bomb.mp3 / zha.mp3
- pass.mp3 / buyao.mp3
- start.mp3
- win.mp3
- lose.mp3

Ranks use these names: 3, 4, 5, 6, 7, 8, 9, 10, j, q, k, a, 2, small-joker, big-joker.

Examples:

- "对7" from the reference video: pair-7.mp3
- "炸" from the reference video: bomb.mp3
- "不要" from the reference video: pass.mp3

Current selected clips from `112909261-1-208.mp4`:

- single-2.mp3 through single-10.mp3, plus single-j.mp3, single-q.mp3, single-k.mp3, single-a.mp3, single-small-joker.mp3, single-big-joker.mp3
- pair-2.mp3 through pair-10.mp3, plus pair-j.mp3, pair-q.mp3, pair-k.mp3, pair-a.mp3
- straight.mp3 / shunzi.mp3
- pair-straight.mp3 / liandui.mp3
- bomb.mp3 / zha.mp3
- pass.mp3 / buyao.mp3 / yaobuqi.mp3
- start.mp3 / win.mp3 / lose.mp3
- one-card-left.mp3 / two-cards-left.mp3 / super-double.mp3 are kept as useful spare clips, but the current game UI does not call them yet.

Note: the single-* and pair-* number clips are kept for manual review, but the current game does not call them because the source video's rapid number list caused audible mismatches. Single and pair plays currently fall back to browser speech synthesis so the spoken rank always matches the card.

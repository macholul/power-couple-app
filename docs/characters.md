# Characters

People pick a ready-made character for their gender when they sign up, and
can change it later under account settings → character. The colours stay
with the gender, pink for women and blue for men, so any character a person
picks is drawn in their side's colour.

Sign-up only shows the picker once a gender has more than one character.
Until then, everyone gets Mae or Baris as before.

## Adding a character

1. Make the four images below and save them as
   `assets/chibis/<key>-face.webp`, `<key>-wave.webp`, `<key>-cute.webp` and
   `<key>-mad.webp`.
2. Add the character to `CHARACTERS` in `src/lib/characters.ts`: its key,
   its name, its gender, and the four images.
3. Add its row to the database in a new migration, and push that migration
   before releasing the app version that offers the character. The database
   refuses characters it doesn't list, and an older version of the app draws
   a character it doesn't ship as the gender's default.

   ```sql
   insert into private.characters (key, gender) values ('<key>', 'female');
   ```

4. Run `npm run preflight`, then the self-test screen in a development
   build. It checks that every image resolves.

The **key** is lowercase letters, digits and hyphens, starts with a letter,
and is at most 32 characters long; the database enforces this. The **name**
is what the picker shows and what VoiceOver reads. Write it in lowercase, like
the rest of the app.

## The four images

For all four images:

- transparent background (WebP with alpha);
- the same 3D chibi style as Mae and Baris, facing the viewer;
- **no text, logos or brand marks**, because App Review rejects other
  companies' trademarks (guideline 5.2.1);
- the same scale as Mae and Baris, so two characters look the same size side
  by side. Each image is drawn whole inside its space (`contain`), so a
  smaller figure stays smaller.

| Pose | File | Size (px) | Where it appears | What it shows |
| --- | --- | --- | --- | --- |
| face | `<key>-face.webp` | 320 × 320 | the round avatar on the home screen, in account settings and in the picker (34–64 pt circles) | the head, filling the square; the circle crops the corners |
| wave | `<key>-wave.webp` | 640 × 640 | the profile screen and the character screen (210–240 pt tall) | the whole body, standing, waving one hand |
| cute | `<key>-cute.webp` | 640 × 640 | the two panels on the home screen (180 pt tall) | the whole body, standing, cheerful: Mae clasps her hands, Baris makes a peace sign |
| mad | `<key>-mad.webp` | 640 × 640 | the "missed confirmations" card (150 pt tall) | the whole body, sitting cross-legged, arms folded, frowning |

Leave a small margin around the whole-body poses, with the feet near the
bottom edge.

## Baris needs new images

His cap shows the MLB logo, and a mark on its side that looks like New Era's,
in all four of his images and in the app icon and splash image
(`assets/images/icon.png`, `splash-icon.png`). Replace them the same way,
keeping the same file names, before submitting to App Review.

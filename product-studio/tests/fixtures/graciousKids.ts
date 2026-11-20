/**
 * Gracious Kids — Ballet Coloring Book: the regression project.
 *
 * Three established recurring characters (their descriptions as the customer set them) and a ten-scene outline as
 * it comes from ChatGPT: Markdown headings, labeled lines, Proverbs 31:26 on some scenes (one with its NIV wording
 * typed in, one as a bare reference), other scenes with no Scripture at all (they need a suggestion and approval).
 * The scene wording here stands in for the customer's own outline, which lives in her browser.
 */
import type { CastMember } from "../../src/engines/cover/brief";

export const GRACIOUS_CAST: CastMember[] = [
  {
    id: "jenny", name: "Jenny Ballerina", age: "about 9", face: "round face, deep brown skin, big bright eyes, warm smile", hair: "long cornrow braids",
    hairAccessories: "large pink hair bow", proportions: "medium height", clothing: "leotard with a tulle tutu, ballet slippers", accessories: "none",
    traits: "long cornrow braids with a large pink hair bow", description: "brave and encouraging", refId: "ref-jenny", refName: "jenny-reference.png",
  },
  {
    id: "renae", name: "Renae Ballerina", age: "about 9", face: "oval face, brown skin, dimples", hair: "large curly high puff",
    hairAccessories: "wide pink headband", proportions: "the tallest of the three", clothing: "wrap cardigan over a leotard, tights", accessories: "none",
    traits: "large curly high puff with a wide pink headband", description: "joyful, claps for her friends", refId: "ref-renae", refName: "renae-reference.png",
  },
  {
    id: "robby", name: "Robby Ballerina", age: "about 8", face: "heart-shaped face, light brown skin, rosy cheeks", hair: "braided high bun with spiral curls",
    hairAccessories: "none", proportions: "petite, the smallest of the three", clothing: "short-sleeved dance dress over tights", accessories: "none",
    traits: "braided high bun with spiral curls", description: "quiet and thoughtful", refId: "ref-robby", refName: "robby-reference.png",
  },
];

export const GRACIOUS_OUTLINE = `# She Is Gracious
Subtitle: A Gracious Kids Ballet Coloring Book
Audience: Girls ages 4–8

## Scene 1: The Brave First Step
**Description:** Jenny stands at the studio doorway on her first day, holding her ballet bag, taking a brave first step inside.
**Characters:** Jenny Ballerina, Renae Ballerina
**Action:** Renae waves her in with a big smile.
**Scripture:** Proverbs 31:26 — “She speaks with wisdom, and faithful instruction is on her tongue.”
**Lesson:** Being new can feel scary, but kind words help us feel brave.

## Scene 2: Warm-Up at the Barre
**Description:** The three girls stretch side by side at the barre in front of a tall mirror.
**Characters:** Jenny, Renae, Robby
**Style notes:** Keep the mirror simple — no reflections to color twice.

## Scene 3: Tying Ballet Shoes
**Description:** Robby sits on a bench while Jenny kneels to help her tie her ballet slipper ribbons.
**Characters:** Jenny, Robby
**Scripture:** Galatians 6:2

## Scene 4: Practicing Pliés
**Description:** In a row, the girls practice pliés with their arms in second position.

## Scene 5: Helping a Friend Up
**Description:** Robby slips; Jenny and Renae kneel to help her up with gentle hands.
**Scripture:** Prov. 31:26

## Scene 6: Costume Fitting
**Description:** Backstage, the girls try on their recital tutus beside a rack of costumes.

## Scene 7: Praying Before the Recital
**Description:** The three girls hold hands in a circle backstage and bow their heads to pray.
**Lesson:** We can talk to God before anything that makes us nervous.

## Scene 8: Opening Night
**Description:** On stage under soft lights, the three dancers perform a graceful arabesque together.

## Scene 9: The Final Bow
**Description:** The girls hold hands and take a bow as the curtain begins to close.

## Scene 10: Flowers for the Dancers
**Description:** After the show, the girls receive small bouquets of flowers and hug each other.
`;

export const JENNY_DESCRIPTION = `Name: Jenny Ballerina
Age: about 9
Face: round face, deep brown skin, big bright eyes, warm smile
Hair: long cornrow braids
Hair accessories: large pink hair bow
Body: medium height
Clothing: leotard with a tulle tutu, ballet slippers
Distinctive features: long cornrow braids with a large pink hair bow
Personality: brave and encouraging`;

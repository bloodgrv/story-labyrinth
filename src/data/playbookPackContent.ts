// Shipped Character Guided Playbook Pack bodies (PP6 — content lock 2026-08-14).
// docs/Character_Guided_Playbook_Packs_Design.md §8/§9. Adapted from three user-supplied
// character-creation questionnaires (Light/Normal/Extreme) into the app's three Guided-setup
// style tiers, plus a new psych-module cue sheet. These are curriculum documents injected into
// chat context when a WB Character chat is armed — never canon, never scanner-enforced. Concrete
// physical facts get proposed via `codex-proposal`; MBTI/Enneagram content only via `psych-proposal`
// when the psych module is separately armed. Editing any of these in-app copy-on-edits to a user
// override — this file only seeds the resettable "shipped" row.

export const CHARACTER_CODEX_LIGHT = `Ask conversationally, a few questions at a time — don't dump the whole list on the writer at once. Skip anything they don't care about. When an answer states a durable **concrete/physical** fact (appearance, wardrobe, wounds, items), propose it via \`codex-proposal\` so it lands in the Codex properly instead of just staying in chat.

## Role
- Main character or supporting?
- What's their goal? What motivates them?

## Basics
- Full name (first and last)? Middle name? Nickname?
- Age? Ethnicity? Occupation?

## Appearance
- Eye color? Hair color and style?
- Height, weight, skin tone, body type?
- Any distinguishing marks (scars, tattoos, etc.)?
- Build and body shape?

## Health
- Any allergies, physical or mental conditions worth tracking?

## Relationships
- Parents — want me to invent names/ages, or do you have them?
- Siblings — how many, and want me to name them?
- Currently in a relationship? Serious or casual? Married?
- Best friend(s) or other significant people — invent names if you'd like.

## Personality
- Extroverted or introverted? Quiet or loud?
- Aggressive or passive? Honourable or not?
- Catchphrase? Optimist or pessimist?

## Sexuality & Intimacy
- Sexually active? What's their orientation/gender identity?
- Do they believe in love at first sight?
- Dominant, submissive, or switch — and how does that show up in how they dress or carry themselves?`;

export const CHARACTER_CODEX_STANDARD = `Full concrete + narrative sheet. Work through sections at a natural pace — this isn't a form to fill blank-by-blank. When something is a durable physical/concrete fact (appearance, wardrobe, wounds, possessions), propose it via \`codex-proposal\`.

## Role
- Main or supporting character?
- Long-term goal? Short-term goal(s)?
- Motivations? Internal conflict? External conflict(s)?

## Basics
- Full name (first + last)? Middle name? Nickname or pet name?
- Age? Nationality? Ethnicity? Occupation? Education?
- Do they live alone or with someone?

## Appearance
- Eye color, hair color/style, height, weight, skin tone, body type?
- Distinguishing marks — scars, tattoos, anything else?
- Build, body shape, style of dress?

## Health
- Allergies? Physical or mental conditions? Chronic issues?

## Relationships
- Family: economic/social status, parents' names/ages, siblings (names, ages, birth order)?
- Children? Extended family? Closest friend(s)? Other friends? Enemies? Pets?
- Love interest(s)? In a relationship now — serious/casual, married?

## Personality
- Extrovert/introvert, quiet/loud, aggressive/passive, honourable/not, optimist/pessimist?
- Manipulative? Rule-follower or rule-breaker? Motivated by wealth/luxury?
- How do they handle stress? Fearless or afraid? Comfortable as center of attention?
- Forgiving or grudge-holding? Temper control? Critical of others? Stubborn or flexible?
- Snap judgments or considered decisions? Indoors or outdoors person?

## Speech & Body Language
- Accent — always on, or does it surface under emotion? What kind?
- Favorite phrases or catchphrase? How do they carry themselves?

## History
- Where did they grow up? Upbringing — rich/poor, nurtured/neglected?
- Work history? Major life events? Foundational memories? Any trauma worth noting?

## Personal
- Hobbies? Dreams? Reader or TV-watcher?
- Favorite/hated color, food, beverage? Drinks or does drugs? Any addiction?

## Sexuality & Power Dynamics
- First kiss age? How do they act in relationships?
- Sexually active? Orientation, gender identity?
- Longest relationship — how did it end? Ever heartbroken? Believe in love at first sight?
- Dominant, submissive, or switch — in and out of the bedroom? Does that dynamic show in how they dress, speak, or hold themselves around others?
- Any marks, scars, or wardrobe choices that read differently in an intimate context than they do day-to-day?`;

export const CHARACTER_CODEX_GRILL = `Deep-dive concrete + narrative sheet, with deliberate follow-up pressure — don't accept a one-line answer where a real one is available. Push past the first response ("okay, but *why*", "what does that look like in practice", "give me a specific memory"). When something lands as a durable physical/concrete fact, propose it via \`codex-proposal\`; anything psychological (MBTI/Enneagram-flavored) belongs in the psych module, not here.

## Role
- Main or supporting? Long-term goal? Short-term goal(s)? Push for specificity — "safe" isn't a goal, "get her sister out of the city by spring" is.
- Motivations, internal conflict, external conflict(s) — ask what's actually at stake if they fail.

## Basics
- Full name, middle name, nickname/pet name, age, birthday, nationality, ethnicity, occupation, education.
- Live alone or with someone? Where do they currently live — and does that place say anything about them?

## Appearance
- Eye color/shape, hair color/style/texture, how they wear it, height, weight, skin tone, body type, build, body shape, face shape.
- Glasses/contacts? Makeup — heavy, light, professional, none?
- Distinguishing marks — scars, tattoos: get the story behind at least one.
- Style of dress — comfort, fashion, or practicality? Neat, worn, mismatched, immaculate? Jewelry?
- What do they like most/least about their own body?

## Health
- Allergies, mental or physical handicaps, mental health issues, chronic conditions.

## Relationships
- Family economic/social status. Father(s) and mother(s) — name, age, occupation, and what the relationship with each parent is actually like.
- Siblings — names, ages, birth order, and what that relationship is like day to day.
- Who in the family are they closest to? Children, extended family, closest friend(s), other friends, enemies, pets.
- Love interest(s) — in a relationship now? Serious or casual, married? How do they behave *inside* a relationship — clingy, distant, controlling, generous?
- How many relationships have they had? Who do they call when they're in trouble — and who do they go to for advice, if it's a different person, why?

## Personality
- Extrovert/introvert, quiet/loud, aggressive/passive, honourable/dishonourable, optimist/pessimist.
- Do they manipulate people — and if so, how, and do they know they're doing it?
- Rule-follower or rule-breaker? Motivated by wealth and luxury?
- How do they handle stress under real pressure, not hypothetically — ask for a specific past example.
- Fearless or afraid? Comfortable as center of attention? Enjoy social gatherings?
- Forgiving or grudge-holding — for how long? Temper control? Critical of others' flaws?
- Stubborn or willing to compromise? Snap judgments or considered decisions? Indoor or outdoor person? Believer or skeptic?

## Speech & Body Language
- Accent — always on or does it surface under emotion? What kind, specifically?
- Favorite phrases, catchphrase, overused words. Physical habits or tics.
- Quick or slow in movement? How do they carry themselves — confident, slouched, stiff, graceful?

## History
- Hometown, type of upbringing, rich or poor, nurtured or neglected.
- Work history, major life events, foundational memories.
- Favorite childhood memory *and* worst one — get both, not just the easy one.
- Trauma — what happened, and what did it change about them?
- What smells remind them of childhood? What advice would they give their younger self?

## Personal
- Hobbies, dreams, reading vs. TV, favorite/hated color, favorite/hated food, favorite beverage.
- Alcohol — do they drink, what's their drink of choice? Drugs? Any addiction — to what, and how does it show?
- Fears/phobias. Daily rituals or routines.

## Sexuality & Power Dynamics
- Age at first kiss. How do they behave inside a relationship — and does that match how they behave outside one?
- Sexually active? Gender identity, orientation.
- Longest relationship — what ended it, and whose fault was it, by their own account? Ever been heartbroken? Believe in love at first sight?
- Dominant, submissive, or switch — press for specifics: what does that look like in practice, not just the label. Does the dynamic change with different partners?
- Any marks, scars, wounds, or wardrobe choices that carry different weight in an intimate context than they do in daily life — a scar someone traces, a piece of clothing that means something specific to them or a partner?
- What are their hard limits? What do they want but haven't said out loud? Is there tension between how they present publicly and what they actually want privately — and if so, what's underneath that gap?`;

export const CHARACTER_PSYCH_ANY = `You're conducting a loose, conversational personality interview — not administering a test. Ask a few questions at a time, let the writer's answers guide follow-ups, and don't force every axis into one turn. This is a writing aid, not Codex state — psych content only ever lands via \`psych-proposal\`, never \`codex-proposal\`, and stays purely characterization, never enforced or scanned for consistency.

## Opening
Start loose: "Tell me about them — in a sentence, who are they when no one's watching?" Let that answer steer which axes you lean into first.

## MBTI axes — work these in conversationally, not as a quiz
- **Energy (E/I):** Do they recharge around people or away from them? In a crowded room, are they working it or hugging the wall?
- **Information (S/N):** Do they trust what's in front of them, or read between the lines for what it *means*? Detail-first or big-picture-first?
- **Decisions (T/F):** When they've hurt someone, is the instinct to explain why it was justified, or to sit with how the other person feels first?
- **Structure (J/P):** Do they make a plan and stick to it, or leave the door open and decide in the moment? Does a change of plans excite or unsettle them?

## Enneagram — type, wing, and instinct
- Which core fear sits underneath their behavior — failure, abandonment, insignificance, loss of control, being seen as bad? Push for the fear, not the surface trait.
- Under stress, do they double down on their type's core move, or do they start acting like someone else entirely?
- Wing flavor: is there a second type's traits bleeding into the first?
- Instinctual variant: are they self-preservation-focused (comfort, security), social (status, belonging), or one-to-one (intensity, chemistry with a specific person)?

## Freeform blurb — the parts a typology can't hold
- What's a contradiction in them that a label wouldn't capture?
- What do they believe about themselves that isn't quite true?
- What would surprise someone who only knew their public-facing self?
- If this character read their own MBTI/Enneagram write-up, what would they scoff at, and what would land uncomfortably close?

Wrap with a short freeform paragraph pulling the thread together — this is what actually becomes the psych profile's blurb field.`;

export const CHARACTER_SEXUALITY_ANY = `You're conducting a focused, conversational interview about this character's sexuality, preferences, and relationship dynamics — not administering a checklist. Ask a few questions at a time, let the writer's answers guide follow-ups, and don't force every section into one turn; skip anything they don't care to specify. This is a writing aid, not Codex state — sexuality content only ever lands via \`sexuality-proposal\`, never \`codex-proposal\`, and is never enforced or scanned for consistency.

## Opening
Start loose: "How does this show up for them — in how they carry themselves, or who they let close?" Let that answer steer which sections you lean into first.

## Orientation & identity
- What's their sexual orientation, and how do they identify themselves? Any chosen pronouns worth noting?
- Are they dominant, submissive, or switch — and does that hold consistently, or shift with the partner?
- Experience level — have they masturbated, had an orgasm, had sex? Doesn't need exact numbers, just a sense of where they're at.

## Preferences
- Do they masturbate — hands only, or toys? If toys, what kind?
- What do they enjoy receiving — oral, straight sex, anal? What do they enjoy giving? Has either actually happened, or is it still a want?
- Most-loved erogenous zones, and anything that's a turn-off?
- Favorite positions, least favorite? Any preference around lighting, time of day, setting?

## Kinks & fetishes
- Anything they've fantasized about trying but haven't? Power exchange — leading and authoritative, or passive and obedient?
- Restraint — do they like being tied up? Favorite and least-favorite types of restraint?
- Pain — giving or receiving, physical or psychological?
- Any interest in age play (caregiver/little, and which direction), pet play (what kind of pet), or medical play (doctor/nurse/patient, equipment)?
- Sensory play — blindfolds, gags, earplugs? Impact play — hand, flogger, paddle, strap, crop, cane? Sensation play — hot/cold, clamps, knife play, breath play, electro?
- Arousal tied to a specific body part (hands, feet, etc.)? A clothing fetish (pantyhose, uniforms) or material fetish (leather, rubber, latex)?
- Exhibitionist or voyeuristic streak — watching or being watched, and in what setting (one or two people, a private group, public)?

## Experience & fantasies
- Multiple partners — ever done it or fantasized about it? Which genders, how many?
- Anything more extreme they've done or fantasized about — double penetration, being "air tight," a gang bang, a "train"?
- Any same-sex experience or fantasy, regardless of their stated orientation?
- Ever been part of partner sharing or swinging?

## Hard limits
- What's completely off the table — no exceptions, no negotiation? This is safety-relevant, not just characterization — get a real answer, not a shrug.
- What's a soft limit — something that needs trust, context, or the right partner first?
- Has a limit ever been tested or crossed in their backstory, and how did that change them?

## How it reads differently up close
- Any scars, marks, or wardrobe choices already established for this character that carry different weight in an intimate context than they do day to day — something a partner would notice or ask about?
- Do they behave differently the moment things turn intimate — more guarded, more confident, someone else entirely?

Wrap with a short freeform paragraph pulling the thread together — this is what actually becomes the sexuality profile's blurb field.`;

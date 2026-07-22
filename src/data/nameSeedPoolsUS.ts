import { tiered, type SeedNamePool } from "./nameSeedPoolsShared.js";

// US core name pools — see nameSeedPoolsShared.ts for the shape/idempotency notes.
export const US_NAME_POOLS: SeedNamePool[] = [
    // ── US female, first name ──────────────────────────────────────────────────
    {
        key: "us-female-1980-1999",
        displayName: "US Female (1980-1999)",
        kind: "first_name",
        gender: "female",
        region: "US",
        eraStart: 1980,
        eraEnd: 1999,
        names: tiered(
            ["Jessica", "Ashley", "Amanda", "Sarah", "Jennifer", "Elizabeth", "Megan", "Emily"],
            ["Amber", "Rachel", "Nicole", "Stephanie", "Melissa"],
            ["Heather", "Danielle"]
        )
    },
    {
        key: "us-female-2000-2019",
        displayName: "US Female (2000-2019)",
        kind: "first_name",
        gender: "female",
        region: "US",
        eraStart: 2000,
        eraEnd: 2019,
        names: tiered(
            ["Emma", "Madison", "Abigail", "Olivia", "Isabella", "Ava", "Sophia", "Chloe"],
            ["Hannah", "Alexis", "Samantha", "Grace", "Natalie"],
            ["Brooklyn", "Addison"]
        )
    },
    {
        key: "us-female-2020-present",
        displayName: "US Female (2020-present)",
        kind: "first_name",
        gender: "female",
        region: "US",
        eraStart: 2020,
        eraEnd: null,
        names: tiered(
            ["Olivia", "Emma", "Charlotte", "Amelia", "Sophia", "Isabella", "Mia", "Evelyn"],
            ["Harper", "Luna", "Camila", "Gianna", "Ellie"],
            ["Nova", "Wrenley"]
        )
    },

    // ── US male, first name ────────────────────────────────────────────────────
    {
        key: "us-male-1980-1999",
        displayName: "US Male (1980-1999)",
        kind: "first_name",
        gender: "male",
        region: "US",
        eraStart: 1980,
        eraEnd: 1999,
        names: tiered(
            ["Michael", "Christopher", "Matthew", "Joshua", "David", "James", "Daniel", "Andrew"],
            ["Justin", "Ryan", "Brandon", "Jason", "Nicholas"],
            ["Tyler", "Cody"]
        )
    },
    {
        key: "us-male-2000-2019",
        displayName: "US Male (2000-2019)",
        kind: "first_name",
        gender: "male",
        region: "US",
        eraStart: 2000,
        eraEnd: 2019,
        names: tiered(
            ["Jacob", "Ethan", "Michael", "Jayden", "William", "Alexander", "Noah", "Daniel"],
            ["Logan", "Mason", "Elijah", "Aiden", "Gabriel"],
            ["Bentley", "Maddox"]
        )
    },
    {
        key: "us-male-2020-present",
        displayName: "US Male (2020-present)",
        kind: "first_name",
        gender: "male",
        region: "US",
        eraStart: 2020,
        eraEnd: null,
        names: tiered(
            ["Liam", "Noah", "Oliver", "Elijah", "James", "William", "Benjamin", "Lucas"],
            ["Henry", "Theodore", "Jack", "Levi", "Owen"],
            ["Ezra", "Silas"]
        )
    },

    // ── US unisex, first name ──────────────────────────────────────────────────
    {
        key: "us-unisex-1980-1999",
        displayName: "US Unisex (1980-1999)",
        kind: "first_name",
        gender: "unisex",
        region: "US",
        eraStart: 1980,
        eraEnd: 1999,
        names: tiered(["Jordan", "Taylor", "Casey", "Morgan", "Jamie", "Alexis"], ["Dakota", "Shawn"], ["Corey"])
    },
    {
        key: "us-unisex-2000-2019",
        displayName: "US Unisex (2000-2019)",
        kind: "first_name",
        gender: "unisex",
        region: "US",
        eraStart: 2000,
        eraEnd: 2019,
        names: tiered(["Riley", "Avery", "Peyton", "Skyler", "Charlie", "Rowan"], ["Emerson", "Hayden"], ["Sawyer"])
    },
    {
        key: "us-unisex-2020-present",
        displayName: "US Unisex (2020-present)",
        kind: "first_name",
        gender: "unisex",
        region: "US",
        eraStart: 2020,
        eraEnd: null,
        names: tiered(["Rowan", "Emerson", "Finley", "Quinn", "Reese", "Sawyer"], ["Remy", "Ellis"], ["Wren"])
    },

    // ── Surname — flat, era/gender-independent (locked decision: "core ship set only") ─────────
    {
        key: "us-surnames",
        displayName: "US Surnames (core)",
        kind: "surname",
        gender: null,
        region: "US",
        eraStart: null,
        eraEnd: null,
        names: tiered(
            [
                "Smith",
                "Johnson",
                "Williams",
                "Brown",
                "Jones",
                "Garcia",
                "Miller",
                "Davis",
                "Rodriguez",
                "Martinez",
                "Wilson",
                "Anderson",
                "Taylor",
                "Thomas"
            ],
            ["Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White"],
            ["Sanchez", "Ramirez", "Torres"]
        )
    }
];

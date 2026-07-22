import { tiered, type SeedNamePool } from "./nameSeedPoolsShared.js";

// UK core name pools — see nameSeedPoolsShared.ts for the shape/idempotency notes.
export const UK_NAME_POOLS: SeedNamePool[] = [
    // ── UK female, first name ──────────────────────────────────────────────────
    {
        key: "uk-female-1980-1999",
        displayName: "UK Female (1980-1999)",
        kind: "first_name",
        gender: "female",
        region: "UK",
        eraStart: 1980,
        eraEnd: 1999,
        names: tiered(
            ["Sophie", "Chloe", "Jessica", "Emily", "Lucy", "Charlotte", "Hannah", "Amy"],
            ["Rebecca", "Laura", "Rachel", "Katie", "Emma"],
            ["Georgia", "Bethany"]
        )
    },
    {
        key: "uk-female-2000-2019",
        displayName: "UK Female (2000-2019)",
        kind: "first_name",
        gender: "female",
        region: "UK",
        eraStart: 2000,
        eraEnd: 2019,
        names: tiered(
            ["Olivia", "Ruby", "Emily", "Grace", "Jessica", "Sophie", "Lily", "Amelia"],
            ["Ella", "Chloe", "Freya", "Isabella", "Poppy"],
            ["Willow", "Matilda"]
        )
    },
    {
        key: "uk-female-2020-present",
        displayName: "UK Female (2020-present)",
        kind: "first_name",
        gender: "female",
        region: "UK",
        eraStart: 2020,
        eraEnd: null,
        names: tiered(
            ["Olivia", "Amelia", "Isla", "Ava", "Ivy", "Freya", "Lily", "Florence"],
            ["Willow", "Grace", "Rosie", "Sophia", "Evie"],
            ["Elodie", "Wren"]
        )
    },

    // ── UK male, first name ────────────────────────────────────────────────────
    {
        key: "uk-male-1980-1999",
        displayName: "UK Male (1980-1999)",
        kind: "first_name",
        gender: "male",
        region: "UK",
        eraStart: 1980,
        eraEnd: 1999,
        names: tiered(
            ["James", "Daniel", "Thomas", "Matthew", "Christopher", "Andrew", "David", "Michael"],
            ["Joshua", "Ryan", "Luke", "Adam", "Jack"],
            ["Callum", "Connor"]
        )
    },
    {
        key: "uk-male-2000-2019",
        displayName: "UK Male (2000-2019)",
        kind: "first_name",
        gender: "male",
        region: "UK",
        eraStart: 2000,
        eraEnd: 2019,
        names: tiered(
            ["Jack", "Thomas", "Oliver", "James", "William", "Joshua", "George", "Charlie"],
            ["Daniel", "Samuel", "Harry", "Joseph", "Alfie"],
            ["Reuben", "Finlay"]
        )
    },
    {
        key: "uk-male-2020-present",
        displayName: "UK Male (2020-present)",
        kind: "first_name",
        gender: "male",
        region: "UK",
        eraStart: 2020,
        eraEnd: null,
        names: tiered(
            ["Oliver", "George", "Noah", "Arthur", "Leo", "Oscar", "Harry", "Archie"],
            ["Freddie", "Theo", "Jacob", "Charlie", "Muhammad"],
            ["Rory", "Frankie"]
        )
    },

    // ── UK unisex, first name ──────────────────────────────────────────────────
    {
        key: "uk-unisex-1980-1999",
        displayName: "UK Unisex (1980-1999)",
        kind: "first_name",
        gender: "unisex",
        region: "UK",
        eraStart: 1980,
        eraEnd: 1999,
        names: tiered(["Sam", "Alex", "Jordan", "Charlie", "Ashley", "Lee"], ["Robin", "Jamie"], ["Kerry"])
    },
    {
        key: "uk-unisex-2000-2019",
        displayName: "UK Unisex (2000-2019)",
        kind: "first_name",
        gender: "unisex",
        region: "UK",
        eraStart: 2000,
        eraEnd: 2019,
        names: tiered(["Charlie", "Alexis", "Frankie", "Bailey", "Reese", "Morgan"], ["Harley", "Kai"], ["Casey"])
    },
    {
        key: "uk-unisex-2020-present",
        displayName: "UK Unisex (2020-present)",
        kind: "first_name",
        gender: "unisex",
        region: "UK",
        eraStart: 2020,
        eraEnd: null,
        names: tiered(["Rowan", "Frankie", "Robin", "Remy", "Wren", "Sunny"], ["Marley", "Ari"], ["Bay"])
    },

    // ── Surname — flat, era/gender-independent (locked decision: "core ship set only") ─────────
    {
        key: "uk-surnames",
        displayName: "UK Surnames (core)",
        kind: "surname",
        gender: null,
        region: "UK",
        eraStart: null,
        eraEnd: null,
        names: tiered(
            [
                "Smith",
                "Jones",
                "Taylor",
                "Williams",
                "Brown",
                "Davies",
                "Evans",
                "Wilson",
                "Thomas",
                "Roberts",
                "Johnson",
                "Lewis",
                "Walker",
                "Robinson"
            ],
            ["Wood", "Thompson", "White", "Watson", "Jackson", "Wright", "Green"],
            ["Cooper", "Turner", "Hughes"]
        )
    }
];

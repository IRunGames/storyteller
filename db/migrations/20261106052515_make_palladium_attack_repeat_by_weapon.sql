-- migrate:up

-- Palladium Fantasy 2e (seed -90) again, now that a group can repeat: the
-- hand-to-hand bonuses move from attack to a new combat group, and attack
-- becomes the list of a character's weapons, each row keyed by its Weapon
-- with that weapon's Strike, Parry, Damage and Initiative. Defense and the
-- empty saves group are as the first seeding wrote them, with the keyedBy
-- every group now carries. Unconditional, by decision: Palladium's
-- definition is owned by this seeding until the saves are named, so
-- whatever the Systems editor holds for -90 is overwritten, unlike the first
-- seeding's guarded write.
UPDATE systems
SET stat_block_definition = '{
  "groups": [
    {
      "name": "defense",
      "label": "Defense",
      "keyedBy": "",
      "stats": [
        { "name": "ar", "label": "AR", "type": "display", "rack": [], "connectedTo": "", "computedAs": "" },
        { "name": "sdc", "label": "SDC", "type": "pool", "rack": [], "connectedTo": "", "computedAs": "" },
        { "name": "current_ar", "label": "Current AR", "type": "computed", "rack": [], "connectedTo": "",
          "computedAs": "if(defense.sdc.value < defense.sdc.max / 2, defense.ar.value - 2, defense.ar.value)" },
        { "name": "dodge", "label": "Dodge", "type": "display", "rack": [], "connectedTo": "", "computedAs": "" },
        { "name": "roll_with_punch", "label": "Roll With Punch", "type": "display", "rack": [], "connectedTo": "", "computedAs": "" }
      ]
    },
    {
      "name": "combat",
      "label": "Combat",
      "keyedBy": "",
      "stats": [
        { "name": "strike", "label": "Strike", "type": "display", "rack": [], "connectedTo": "", "computedAs": "" },
        { "name": "parry", "label": "Parry", "type": "display", "rack": [], "connectedTo": "", "computedAs": "" },
        { "name": "damage", "label": "Damage", "type": "display", "rack": [], "connectedTo": "", "computedAs": "" },
        { "name": "initiative", "label": "Initiative", "type": "display", "rack": [], "connectedTo": "", "computedAs": "" }
      ]
    },
    {
      "name": "attack",
      "label": "Attack",
      "keyedBy": "weapon",
      "stats": [
        { "name": "weapon", "label": "Weapon", "type": "display", "rack": [], "connectedTo": "", "computedAs": "" },
        { "name": "strike", "label": "Strike", "type": "display", "rack": [], "connectedTo": "", "computedAs": "" },
        { "name": "parry", "label": "Parry", "type": "display", "rack": [], "connectedTo": "", "computedAs": "" },
        { "name": "damage", "label": "Damage", "type": "display", "rack": [], "connectedTo": "", "computedAs": "" },
        { "name": "initiative", "label": "Initiative", "type": "display", "rack": [], "connectedTo": "", "computedAs": "" }
      ]
    },
    { "name": "saves", "label": "Saves", "keyedBy": "", "stats": [] }
  ]
}'::jsonb,
    updated_at = NOW()
WHERE id_system = -90;

-- What elements already hold under attack is the hand-to-hand values typed
-- before this change, so they move to combat rather than hiding behind the
-- lenient read until the next save drops them. Only an object moves (rows
-- are an array, so a block already in the new shape is left alone), and
-- only where combat has nothing yet. Idempotent by that same test. The
-- parentheses matter: - binds tighter than ->, so without them the two
-- literals would be subtracted first.
UPDATE elements
SET stat_blocks = jsonb_set(
      stat_blocks,
      '{-90}',
      ((stat_blocks -> '-90') - 'attack'::text)
        || jsonb_build_object('combat', coalesce(stat_blocks -> '-90' -> 'combat', stat_blocks -> '-90' -> 'attack'))
    ),
    updated_at = NOW()
WHERE jsonb_typeof(stat_blocks -> '-90' -> 'attack') = 'object';

-- migrate:down


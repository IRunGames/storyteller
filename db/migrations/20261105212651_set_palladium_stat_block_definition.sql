-- migrate:up

-- The first stat block definition, on Palladium Fantasy 2e (seed -90):
-- defense, attack and saves. SDC is a pool; AR is set on the element and
-- Current AR is worked out from it, two lower while SDC is under half, which
-- is the rule at the table; Dodge and Roll With Punch are plain values. The saves group is left empty for its stats to
-- be named in the administrators' editor. Idempotent by its WHERE: a row
-- whose definition is no longer the empty one has been edited since and is
-- left as it is.
UPDATE systems
SET stat_block_definition = '{
  "groups": [
    {
      "name": "defense",
      "label": "Defense",
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
      "name": "attack",
      "label": "Attack",
      "stats": [
        { "name": "strike", "label": "Strike", "type": "display", "rack": [], "connectedTo": "", "computedAs": "" },
        { "name": "parry", "label": "Parry", "type": "display", "rack": [], "connectedTo": "", "computedAs": "" },
        { "name": "damage", "label": "Damage", "type": "display", "rack": [], "connectedTo": "", "computedAs": "" },
        { "name": "initiative", "label": "Initiative", "type": "display", "rack": [], "connectedTo": "", "computedAs": "" }
      ]
    },
    { "name": "saves", "label": "Saves", "stats": [] }
  ]
}'::jsonb,
    updated_at = NOW()
WHERE id_system = -90
  AND stat_block_definition = '{"groups":[]}'::jsonb;

-- migrate:down


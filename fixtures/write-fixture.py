#!/usr/bin/env python3
"""Install a named creature fixture into a copy of the plain shard-format seed."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path)
parser.add_argument("fixture", choices=("rabbit", "dragonfly"))
parser.add_argument("--bad", action="store_true", help="plant a missing strike")
args = parser.parse_args()
sections = args.source / "sections"

def read(name):
    return json.loads((sections / f"{name}.json").read_text())

def write(name, value):
    (sections / f"{name}.json").write_text(json.dumps(value, indent=2) + "\n")

dragonfly = args.fixture == "dragonfly"
label = "Giant dragonfly" if dragonfly else "Angry rabbit"
species_id = f"fixture.{args.fixture}"
look_id = f"{species_id}.look"
strike_id = f"{species_id}.{'dive' if dragonfly else 'bite'}"
world_spawn = read("world/spawn")["spawn"]

species = {
    "id": species_id, "kind": species_id, "label": label,
    "aggressive": True, "lockable": True, "capExempt": False,
    "dims": {"bodyY": 0.22, "bodyHalfLen": 0.19, "bodyRadius": 0.15,
             "headRadius": 0.09, "legLen": 0.12, "feet": [], "halfWidth": 0.14},
    "variants": [{"id": "plain", "label": label, "rarity": "common", "weight": 1,
                  "scale": [1, 1], "hp": 30, "mods": {"speed": 1, "chargeDist": 1,
                  "chargeDamage": 0, "damageTaken": 1, "relentless": False}}],
    "body": {"size": "tiny", "scale": 1, "look": look_id},
    "temperament": {"brain": "pursue", "reaction": "aggressive", "leash": 20,
                    "assist": 0, "home": {"speed": 1.8, "stop": 1},
                    "tuning": {"speed": 2.4, "turnRate": 8, "thinkDivisor": 1,
                               "attackCooldownTicks": 120, "wanderRadius": 0,
                               "wanderEveryTicks": 120}},
    "senses": {"notice": 16},
    "abilities": [{"use": "fixture.missing" if args.bad else strike_id,
                   "range": 1.6, "cooldown": 3, "weight": 1}],
}
brain = None
height = 0
distance = 5
if dragonfly:
    height, distance = 4, -1
    species["dims"] = {"bodyY": 1, "bodyHalfLen": 1.5, "bodyRadius": 0.5,
                       "headRadius": 0.33, "legLen": 0.3, "feet": [], "halfWidth": 1.4}
    species["body"]["size"] = "large"
    species["flight"] = {"altitude": 4, "above": "world", "climbRate": 12, "diveRate": 12}
    species["temperament"]["brain"] = "none"
    species["temperament"].pop("tuning")
    brain = {
        "id": "fixture.dragonfly.orbit", "kind": "orbit-diver", "thinkDivisor": 3,
        "strike": strike_id, "home": {"x": world_spawn["x"], "y": 0,
                                      "z": world_spawn["z"] + distance, "r": 10},
        "circleSpeed": 3, "hangAltitude": 4, "stalkSpeed": 3, "diveSpeed": 8,
        "restSeconds": 1, "noticeRadius": 18, "giveUpRadius": 40,
        "initialRestSeconds": 0, "stalkMaxSeconds": 1, "riseMargin": 0.5,
        "targetHeight": 1.2, "alignRadius": 2, "alignTolerance": 1,
    }
write("actors/species", {"rows": {"species": [species]}})
write("actors/creatures", {"creatures": {"brains": [brain] if brain else [], "groups": [], "spawns": [{
    "id": species_id, "species": species_id, "variant": "plain", "brain": brain["id"] if brain else None,
    "strike": None, "seed": 17, "scale": 1, "yaw": 3.141592653589793,
    "at": [world_spawn["x"], height, world_spawn["z"] + distance],
}]}})
write("combat/strikes", {"rows": {"strikes": [{
    "id": strike_id, "shape": {"kind": "sphere", "radius": 1.6}, "windup": 0.15,
    "active": 0.12, "recover": 0.4, "cooldown": 3, "range": 1.6, "damage": 1,
    "tags": [f"creature.{args.fixture}"], "weight": 1, "speed": 0,
}]}})
write("look/materials", {"rows": {"looks": [{
    "id": look_id, "species": species_id, "recipe": "engine.sphere", "material": None,
    "parameters": {"colour": [0.62, 0.52, 0.4], "radius": 1 if dragonfly else 0.18,
                   "heightSegments": 6, "widthSegments": 10},
    "animation": {"recipe": "engine.scale-wave", "parameters": {}},
}]}})

/*
 * Default module for singles
 *
 */

exports.id = "singles-eff";

var battleData = require("./../battle-data.js");
var TypeChart = require('./../typechart.js');
var Calc = require('./../calc.js');
var Data = require('./../battle-data.js');
var Smogon = require('./../smogon.js');
var Move = battleData.Move;



var Pokemon = Calc.Pokemon;
var Conditions = Calc.Conditions;

function supposeActiveFoe (battle) {
	var target = battle.foe.active[0];
	debug("SUPPOSING POKEMON");
	var moves=target.moves;
	var length = moves.length;
	if(length<4 && target.helpers.possibleMoves){
		for(var i=0;i<4-length;i++){
			moves.push(target.helpers.possibleMoves[i]);
		}
	}
	var ability = target.ability;
	if(ability==='&unknown' && target.helpers.possibleAbility){
		ability=target.helpers.possibleAbility[0] || "&unknown";
	}
	var evs=[];
	if(target.helpers.possibleEVs){
		evs=target.helpers.possibleEVs[0];
	}

	var nature= "&unknown";
	if(target.helpers.possibleNature){
		nature=target.helpers.possibleNature[0];
	}
	var pokeB = new Pokemon(target.template, {
		level: target.level,
		gender: target.gender,
		shiny: target.shiny,
		evs: evs,
		nature: nature,
		ability: ability
	});

    // console.log("SUPPOSE RESULT", JSON.stringify(pokeB,null,4));

    pokeB.moves = moves;
	pokeB.hp = target.hp;
	pokeB.status = target.status;
	if (target.item === "&unknown") {
		if(target.helpers.possibleItem){
			pokeB.item= target.helpers.possibleItem;
		}
		else
			pokeB.item = null;
	} else {
		pokeB.item = target.item;
	}
	pokeB.stats = pokeB.getStats();

	if (!target.supressedAbility) {
		if (target.ability === "&unknown") {
			pokeB.ability = pokeB.template.abilities ? Data.getAbility(pokeB.template.abilities[0]) : null;
		} else {
			pokeB.ability = target.ability;
		}
	}

	return pokeB;
}

function evaluatePokemon (battle, sideId, noMega) {
	if (!battle.foe.active[0] || battle.foe.active[0].fainted) return {t: 0, d: 0};
	var pokeA = battle.getCalcRequestPokemon(sideId, !noMega);
	var pokeB = supposeActiveFoe(battle);
    var stats  = pokeB.getStats(battle.gen);
    battle.foe.active[0].stats= stats;
    pokeB.stats=stats;
	// debug("Pokemon Stats!");
	var res = {t: 0, d: 0};
	var conditionsA, conditionsB;
	var t = 0;
	conditionsB = new Conditions({
		side: battle.foe.side,
		volatiles: battle.foe.active[0].volatiles,
		boosts: battle.foe.active[0].boosts
	});
	if (sideId < battle.self.active.length) {
		conditionsA = new Conditions({
			side: battle.self.side,
			volatiles: battle.self.active[0].volatiles,
			boosts: battle.self.active[0].boosts
		});
	} else {
		conditionsA = new Conditions({
			side: battle.self.side,
			volatiles: {},
			boosts: {}
		});
	}

	/* Calculate t - types mux */
	var inverse = !!battle.conditions["inversebattle"];
	var mux, tmux;
	for (var i = 0; i < 2; i++) {
		if (pokeB.template.types[i]) {
			mux = 1;
			for (var j = 0; j < pokeA.template.types.length; j++) {
				tmux = TypeChart.getEffectiveness(pokeB.template.types[i], pokeA.template.types[j], battle.gen);
				if (inverse) {
					if (tmux === 0) tmux = 2;
					else tmux = 1 / tmux;
				}
				mux *= tmux;
			}
			t += mux;
		} else {
			t += 1;
		}
	}
	res.t = t;

	/* Calculate d - max damage */
	var moves = battle.request.side.pokemon[sideId].moves;
	var d = 0;
	for (var i = 0; i < moves.length; i++) {
		var move = Data.getMove(moves[i], battle.gen);
		var dmg = Calc.calculate(pokeA, pokeB, move, conditionsA, conditionsB, battle.conditions, battle.gen).getMax();
		if (dmg > d) d = dmg;
	}
	res.d = d;

	return res;
}

/*
* Moves
*/

function foeCanSwitch (battle) {
	var totalPokes = battle.foe.teamPv.length || 6;
	if (battle.foe.pokemon.length === totalPokes) {
		for (var i = 0; i < battle.foe.pokemon.length; i++) {
			if (!battle.foe.pokemon[i].fainted && !battle.foe.pokemon[i].active) {
				return true;
			}
		}
		return false;
	}
	return true;
}

function selfCanSwitch (battle) {
	for (var i = 0; i < battle.request.side.pokemon.length; i++) {
		if (battle.request.side.pokemon[i].condition !== "0 fnt" && !battle.request.side.pokemon[i].active) {
			return true;
		}
	}
	return false;
}

function selfHasStatus (battle) {
	for (var i = 0; i < battle.request.side.pokemon.length; i++) {
		if (battle.parseStatus(battle.request.side.pokemon[i].condition).status in {"slp": 1, "brn": 1, "psn": 1, "tox": 1, "par": 1, "frz": 1}) {
			return true;
		}
	}
	return false;
}

function alreadyOppSleeping (battle) {
	for (var i = 0; i < battle.foe.pokemon.length; i++) {
		if (battle.foe.pokemon[i].status === "slp") {
			return true;
		}
	}
	return false;
}

var getViableSupportMoves = exports.getViableSupportMoves = function (battle, decisions, pokeA, pokeB) {
	var res = {
		viable: [],
		unviable: [],
		recommended: [],
		sleepTalk: null,
		total: 0
	};
	var conditionsB = new Conditions({
		side: battle.foe.side,
		volatiles: battle.foe.active[0].volatiles,
		boosts: battle.foe.active[0].boosts
	});
	var conditionsA = new Conditions({
		side: battle.self.side,
		volatiles: battle.self.active[0].volatiles,
		boosts: battle.self.active[0].boosts
	});
	for (var i = 0; i < decisions.length; i++) {
		var des = decisions[i][0];
		if (des.type !== "move") continue; // not a move
		if (battle.request.active[0].canMegaEvo || battle.request.side.pokemon[0].canMegaEvo) {
			if (!des.mega) continue; // Mega evolve by default
		}
		var move = Data.getMove(battle.request.side.pokemon[0].moves[des.moveId]);
		if (move.category === "Status") res.total++;

		if (move.flags && move.flags['reflectable'] && pokeB.ability && pokeB.ability.id === "magicbounce") {
			res.unviable.push(decisions[i]);
			continue;
		}
		if (pokeA.ability.id !== 'infiltrator' && conditionsB.volatiles["substitute"] && move.target !== "self" && move.target !== "allySide" && move.target !== "foeSide" && move.target !== "allyTeam") {
			if (!move.flags || !move.flags['authentic'] ) {
				res.unviable.push(decisions[i]);
				continue;
			}
		}
		if (move.flags && move.flags["powder"] && battle.gen > 5) {
			if (pokeB.ability && pokeB.ability.id === "overcoat") {
				res.unviable.push(decisions[i]);
				continue;
			}
			if (pokeB.template.types.indexOf("Grass") >= 0) {
				res.unviable.push(decisions[i]);
				continue;
			}
		}
		if (move.id === "stockpile") {
			if (conditionsA.volatiles["stockpile3"]) {
				res.unviable.push(decisions[i]);
				continue;
			}
		}
		switch (move.id) {
			case "spikes":
				if (foeCanSwitch(battle) && conditionsB.side["spikes"] !== 3) res.orecommended.push(decisions[i]);
				else res.unviable.push(decisions[i]);
				continue;
			case "toxicspikes":
				if (foeCanSwitch(battle) && conditionsB.side["toxicspikes"] !== 2) res.recommended.push(decisions[i]);
				else res.unviable.push(decisions[i]);
				continue;
			case "stealthrock":
				if (foeCanSwitch(battle) && !conditionsB.side["stealthrock"]) res.recommended.push(decisions[i]);
				else res.unviable.push(decisions[i]);
				continue;
			case "stickyweb":
				if (foeCanSwitch(battle) && !conditionsB.side["stickyweb"]) res.recommended.push(decisions[i]);
				else res.unviable.push(decisions[i]);
				continue;
			case "wish":
				if (battle.self.active[0].helpers.lastMove !== "wish") res.viable.push(decisions[i]);
				else res.unviable.push(decisions[i]);
				continue;
			case "rapidspin":
				if (selfCanSwitch(battle) && (conditionsA.side["spikes"] || conditionsA.side["toxicspikes"] || conditionsA.side["stealthrock"] || conditionsA.side["stickyweb"])) {
					if (Calc.calculate(pokeA, pokeB, move, conditionsA, conditionsB, battle.conditions, battle.gen).getMax() === 0) {
						res.unviable.push(decisions[i]);
					} else {
						res.recommended.push(decisions[i]);
					}
				} else {
					res.unviable.push(decisions[i]);
				}
				continue;
			case "defog":
				if (battle.gen < 6) {
					// Defog does not work before gen 6
					res.unviable.push(decisions[i]);
					continue;
				}
				if (selfCanSwitch(battle) && (conditionsA.side["spikes"] || conditionsA.side["toxicspikes"] || conditionsA.side["stealthrock"] || conditionsA.side["stickyweb"])) {
					res.recommended.push(decisions[i]);
				} else {
					res.unviable.push(decisions[i]);
				}
				continue;
			case "sleeptalk":
				if (pokeA.status === "slp") {
					if (typeof battle.self.active[0].helpers.sleepCounter === "number") {
						if (battle.self.active[0].helpers.sleepCounter < 2) res.sleepTalk = decisions[i];
					}
					res.recommended.push(decisions[i]);
				} else {
					res.unviable.push(decisions[i]);
				}
				continue;
			case "substitute":
				if (!conditionsA.volatiles["substitute"] && pokeA.hp > 25) res.viable.push(decisions[i]);
				else res.unviable.push(decisions[i]);
				continue;
			case "leechseed":
				if (!conditionsB.volatiles["leechseed"] && pokeB.template.types.indexOf("Grass") < 0) res.viable.push(decisions[i]);
				else res.recommended.push(decisions[i]);
				continue;
			case "endeavor":
			case "painsplit":
				if (pokeA.hp < pokeB.hp) res.viable.push(decisions[i]);
				else res.unviable.push(decisions[i]);
				continue;
			case "bellydrum":
				if (pokeA.hp >= 60 && conditionsA.boosts.atk && conditionsA.boosts.atk < 3) res.viable.push(decisions[i]);
				else res.unviable.push(decisions[i]);
				continue;
			case "geomancy":
				if (pokeA.item && pokeA.item.id === "powerherb") res.viable.push(decisions[i]);
				else if (!pokeA.item) res.unviable.push(decisions[i]);
				continue;
			case "destinybond":
                if(battle.self.active[0].helpers.lastMove !== "destinybond")
					res.viable.push(decisions[i]);
				continue;
			case "disable":
			case "encore":
				if (battle.foe.active[0].helpers.sw && battle.foe.active[0].helpers.lastMove && battle.foe.active[0].helpers.sw && battle.turn - battle.foe.active[0].helpers.sw > 1 && battle.foe.active[0].helpers.lastMoveTurn > battle.foe.active[0].helpers.sw) {
					res.viable.push(decisions[i]);
				} else {
					res.unviable.push(decisions[i]);
				}
				continue;
			case "attract":
				if (!conditionsB.volatiles[move.volatileStatus] && pokeB.ability.id !== "oblivious"
					&& (pokeA.gender === "M" || pokeA.gender === "F") && (pokeB.gender === "M" || pokeB.gender === "F") && (pokeA.gender !== pokeB.gender)) {
					res.viable.push(decisions[i]);
				} else {
					res.unviable.push(decisions[i]);
				}
				continue;
			case "curse":
				if (pokeA.template.types.indexOf("Ghost") >= 0) {
					if (!conditionsB.volatiles[move.volatileStatus]) res.viable.push(decisions[i]);
					else res.unviable.push(decisions[i]);
				} else {
					var curseBoosts = {"atk": 1, "def": 1};
					var alCurBoost = 0;
					for (var cb in curseBoosts) {
						alCurBoost++;
						if (conditionsA.boosts[cb] && conditionsA.boosts[cb] >= 6) alCurBoost--;
					}
					if (alCurBoost > 0) res.viable.push(decisions[i]);
					else res.unviable.push(decisions[i]);
				}
				continue;
			case "yawn":
				if (!conditionsB.volatiles[move.volatileStatus] && pokeB.status !== "slp") {
					res.viable.push(decisions[i]);
				} else {
					res.unviable.push(decisions[i]);
				}
				continue;
			case "foresight":
			case "odorsleuth":
				if (!conditionsB.volatiles[move.volatileStatus] && pokeB.template.types.indexOf("Ghost") >= 0) {
					res.viable.push(decisions[i]);
				} else {
					res.unviable.push(decisions[i]);
				}
				continue;
			case "gastroacid":
				if (!battle.foe.active[0].supressedAbility) {
					res.viable.push(decisions[i]);
				} else {
					res.unviable.push(decisions[i]);
				}
				continue;
			case "nightmare":
				if (!conditionsB.volatiles[move.volatileStatus] && pokeB.status === "slp") {
					res.viable.push(decisions[i]);
				} else {
					res.unviable.push(decisions[i]);
				}
				continue;
			case "perishsong":
				if (!conditionsB.volatiles["perish3"] && !conditionsB.volatiles["perish2"] && !conditionsB.volatiles["perish1"]) {
					res.viable.push(decisions[i]);
				} else {
					res.unviable.push(decisions[i]);
				}
				continue;
			case "reflect":
				if (conditionsA.volatiles["reflect"]) { // Gen 1
					res.unviable.push(decisions[i]);
					continue;
				}
		}
		if (move.target !== "self" && move.target !== "allySide" && move.target !== "allyTeam" && move.target !== "foeSide" && move.ignoreImmunity === false) {
			var mvCat = move.category;
			var mvBp = move.basePower;
			move.basePower = 50;
			move.category = "Physical";
			if (Calc.calculate(pokeA, pokeB, move, conditionsA, conditionsB, battle.conditions, battle.gen).getMax() === 0) {
				move.basePower = mvBp;
				move.category = mvCat;
				res.unviable.push(decisions[i]);
				continue;
			} else {
				move.basePower = mvBp;
				move.category = mvCat;
			}
		}
		if (move.target === 'allySide' && move.sideCondition) {
			if (!conditionsA.side[toId(move.sideCondition)]) res.viable.push(decisions[i]);
			else res.unviable.push(decisions[i]);
			continue;
		}
		var singleTurnMoves = {"protect": 1, "detect": 1, "endure": 1, "kingsshield": 1, "quickguard": 1, "spikyshield": 1, "wideguard": 1};
		if (move.id in singleTurnMoves) {
			if (battle.self.active[0].helpers.lastMove in singleTurnMoves) res.unviable.push(decisions[i]);
			else if (pokeA.hp <=70 && battle.self.active[0].helpers.lastMove === 'wish') res.recommended.push(decisions[i]);
			else res.viable.push(decisions[i]);
			continue;
		}
		if (move.id in {"refresh": 1, "healbell": 1, "aromatherapy": 1}) {
			debug(move.id);
			if (selfHasStatus(battle)) res.viable.push(decisions[i]);
			else res.unviable.push(decisions[i]);
			continue;
		}
		if (move.id in {"haze": 1, "whirlwind": 1, "roar": 1}) {
			var boostsHaze = 0;
			for (var j in conditionsB.boosts)
				if (conditionsB.boosts[j] > 0) boostsHaze++;
			if (boostsHaze) {
				if(conditionsB.volatiles["substitute"]){
                    res.recommended.push(decisions[i]);
				}
				else res.viable.push(decisions[i]);
			} else {
				res.unviable.push(decisions[i]);
			}
			continue;
		}
		if (move.status) {
			if (pokeB.status) {
				res.unviable.push(decisions[i]);
				continue;
			}
			if (move.status === "par") {
				if (battle.gen > 5 && pokeB.template.types.indexOf("Electric") >= 0) {
					res.unviable.push(decisions[i]);
					continue;
				}
			} else if (move.status === "brn") {
				if (pokeB.template.types.indexOf("Fire") >= 0) {
					res.unviable.push(decisions[i]);
					continue;
				}
			} else if (move.status === "psn" || move.status === "tox") {
				if (pokeB.template.types.indexOf("Poison") >= 0) {
					res.unviable.push(decisions[i]);
					continue;
				}
				if (battle.gen > 2 && pokeB.template.types.indexOf("Steel") >= 0) {
					res.unviable.push(decisions[i]);
					continue;
				}
			} else if (move.status === "slp") {
				if (battle.rules.indexOf("Sleep Clause Mod") >= 0 && alreadyOppSleeping(battle)) {
					res.unviable.push(decisions[i]);
					continue;
				}
			}
			res.viable.push(decisions[i]);
			continue;
		}
		if (move.heal || move.id in {"rest": 1, "synthesis": 1, "morningsun": 1, "moonlight": 1}) {
			if (pokeA.hp > 85) {
				res.unviable.push(decisions[i]);
				continue;
			} else {
				res.viable.push(decisions[i]);
				continue;
			}
		}
		if (move.boosts && move.target === "self") {
			if (pokeA.hp < 75) {
				res.unviable.push(decisions[i]);
				continue;
			}
			var alreadyBoost = 0;
			for (var b in move.boosts) {
				alreadyBoost++;
				if (conditionsA.boosts[b] && conditionsA.boosts[b] >= 6) { // Max
					alreadyBoost--;
				}
			}
			if (alreadyBoost > 0) {
				res.viable.push(decisions[i]);
			} else {
				res.unviable.push(decisions[i]);
			}
			continue;
		}
		if (move.id in {"supersonic": 1, "swagger": 1, "sweetkiss": 1, "confuseray": 1, "teeterdance": 1, "flatter": 1, "embargo": 1, "taunt": 1, "telekinesis": 1, "torment": 1, "healblock": 1}) {
			if (conditionsB.volatiles[move.volatileStatus]) {
				res.unviable.push(decisions[i]);
			} else {
				res.viable.push(decisions[i]);
			}
			continue;
		}
		if (move.id in {"ingrain": 1, "acuaring": 1, "focusenergy": 1, "imprison": 1, "magnetrise": 1, "powertrick": 1}) {
			if (conditionsA.volatiles[move.volatileStatus]) {
				res.unviable.push(decisions[i]);
			} else {
				res.viable.push(decisions[i]);
			}
			continue;
		}
		if (move.weather && battle.conditions.weather) {
			var weather = toId(battle.conditions.weather);
			if (weather && ((weather in {'desolateland': 1, 'primordialsea': 1, 'deltastream': 1}) || weather === toId(move.weather))) {
				res.unviable.push(decisions[i]);
			} else {
				res.viable.push(decisions[i]);
			}
			continue;
		}
		if (move.target === 'all') {
			if (battle.conditions[move.id]) {
				res.unviable.push(decisions[i]);
			} else {
				res.viable.push(decisions[i]);
			}
			continue;
		}
		if (move.id === 'metronome') {
			res.unviable.push(decisions[i]);
			continue;
		}
		res.unviable.push(decisions[i]);
	}
	return res;
};


var getEnemyDamageMoves = exports.getEnemyDamageMoves = function (battle, pokeA, pokeB) {
    var res = {
        ohko: [], // +90% -> replace status moves
        thko: [], // +50% -> No switch
        meh: [], // +30% -> switch only if better types
        bad: [], // 0-29 -> better types or same types and better damage
        immune: [],
        total: 0
    };

    var conditionsB = new Conditions({
        side: battle.foe.side,
        volatiles: battle.foe.active[0].volatiles,
        boosts: battle.foe.active[0].boosts
    });
    var conditionsA = new Conditions({
        side: battle.self.side,
        volatiles: battle.self.active[0].volatiles,
        boosts: battle.self.active[0].boosts
    });
    for (var i = 0; i < pokeB.moves.length; i++) {
        var des = pokeB.moves[i];
        // if (battle.request.active[0].canMegaEvo || battle.request.side.pokemon[0].canMegaEvo) {
        //     if (!des.mega) continue; // Mega evolve by default
        // }
        var move = Data.getMove(des.id);
        if (move.category !== "Physical" && move.category !== "Special") continue; // Status move
        if(move.priority>0) des.priority=true; else{des.priority=false}//Move has priority
        var dmg = Calc.calculate(pokeB, pokeA, move, conditionsB, conditionsA, battle.conditions, battle.gen).getMax();
        var hp = pokeA.hp;
        if (dmg === 0 || move.id === "struggle") {
            res.immune.push(des);
            continue;
        }
        var pc = dmg * 100 / hp;
        debug("Enemy Move: " + move.name + " | Damage = " + dmg + " | Percent: " + pc);
        if (move.id === "fakeout") {
            if (battle.foe.active[0].helpers.sw === battle.turn || battle.foe.active[0].helpers.sw === battle.turn - 1) {
                if (TypeChart.getMultipleEff("Normal", pokeA.template.types, battle.gen, true, !!battle.conditions["inversebattle"]) >= 1) {
                    if (pc >= 90) {
                        res.ohko.push(des);
                    } else {
                        res.thko.push(des);
                    }
                    res.total++;
                    continue;
                }
            } else {
                res.immune.push(des);
                continue;
            }
        }
        res.total++;
        if (pc >= 100) {
            res.ohko.push(des);
        } else if (pc >= 50) {
            res.thko.push(des);
        } else if (pc >= 30) {
            res.meh.push(des);
        } else {
            res.bad.push(des);
        }
    }
    return res;
};

var getViableDamageMoves = exports.getViableDamageMoves = function (battle, decisions, pokeA, pokeB) {
	var res = {
		ohko: [], // +90% -> replace status moves
		thko: [], // +50% -> No switch
		meh: [], // +30% -> switch only if better types
		bad: [], // 0-29 -> better types or same types and better damage
		immune: [],
		total: 0
	};
	var conditionsB = new Conditions({
		side: battle.foe.side,
		volatiles: battle.foe.active[0].volatiles,
		boosts: battle.foe.active[0].boosts
	});
	var conditionsA = new Conditions({
		side: battle.self.side,
		volatiles: battle.self.active[0].volatiles,
		boosts: battle.self.active[0].boosts
	});
	for (var i = 0; i < decisions.length; i++) {
		var des = decisions[i][0];
		if (des.type !== "move") continue; // not a move
		if (battle.request.active[0].canMegaEvo || battle.request.side.pokemon[0].canMegaEvo) {
			if (!des.mega) continue; // Mega evolve by default
		}
		var move = Data.getMove(battle.request.side.pokemon[0].moves[des.moveId]);
		if (move.category !== "Physical" && move.category !== "Special") continue; // Status move
        if(move.priority>0) des.priority=true; else{des.priority=false} //Move has priority
        var dmg = Calc.calculate(pokeA, pokeB, move, conditionsA, conditionsB, battle.conditions, battle.gen).getMax();
		var hp = pokeB.hp;
		if (dmg === 0 || move.id === "struggle") {
			res.immune.push(decisions[i]);
			continue;
		}
		var pc = dmg * 100 / hp;
		debug("Move: " + move.name + " | Damage = " + dmg + " | Percent: " + pc);
		if (move.id === "fakeout") {
			if (battle.self.active[0].helpers.sw === battle.turn || battle.self.active[0].helpers.sw === battle.turn - 1) {
				if (TypeChart.getMultipleEff("Normal", pokeB.template.types, battle.gen, true, !!battle.conditions["inversebattle"]) >= 1) {
					if (pc >= 90) {
						res.ohko.push(decisions[i]);
					} else {
						res.thko.push(decisions[i]);
					}
					res.total++;
					continue;
				}
			} else {
				res.immune.push(decisions[i]);
				continue;
			}
		}
		res.total++;
		if (pc >= 100) {
			res.ohko.push(decisions[i]);
		} else if (pc >= 50) {
			res.thko.push(decisions[i]);
		} else if (pc >= 30) {
			res.meh.push(decisions[i]);
		} else {
			res.bad.push(decisions[i]);
		}
	}
	return res;
};

function debugBestMove (bestSw, damageMoves, supportMoves,enemyMoves) {
	debug("singles-eff.js#debugBestMove -- start");
	debug("Best switch: " + (bestSw ? bestSw[0].poke : "none"));
    // debug("Damage Moves:");
    // console.log(JSON.stringify(damageMoves,null,4));
    // debug("Support Moves:");
    // console.log(JSON.stringify(supportMoves,null,4));

    var tmp;
	for (var i in damageMoves) {
		if (!damageMoves[i] || !damageMoves[i].length) continue;
		tmp = [];
		for (var j = 0; j < damageMoves[i].length; j++) {
			tmp.push(damageMoves[i][j][0].move);
		}
		debug("Damage Moves (" + i + ") -> " + tmp);
	}
	for (var i in supportMoves) {
		if (!supportMoves[i] || !supportMoves[i].length) continue;
		tmp = [];
		for (var j = 0; j < supportMoves[i].length; j++) {
			tmp.push(supportMoves[i][j][0].move);
		}
		debug("Support Moves (" + i + ") -> " + tmp);
	}
    for (var i in enemyMoves) {
        if (!enemyMoves[i] || !enemyMoves[i].length) continue;
        tmp = [];
        for (var j = 0; j < enemyMoves[i].length; j++) {
            tmp.push(enemyMoves[i][j].name);
        }
        debug("Enemy Damage Moves (" + i + ") -> " + tmp);
    }

}

var compareSpeeds = function (A, B){return (A !== B)? Number(A > B) : null};
var isPriority  = function(move){return move[0].priority};
var bestPrio = function(damageMoves){
	var badmove = damageMoves.bad.find(isPriority);
    var mehmove = damageMoves.meh.find(isPriority);
    var tmove = damageMoves.thko.find(isPriority);
    var omove = damageMoves.ohko.find(isPriority);
    var best= omove | tmove | mehmove | badmove | false;
    return best;
}

var getBestMove = exports.getBestMove = function (battle, decisions) {
	var bestSW = exports.getBestSwitch(battle, decisions);

    var pokeA = battle.getCalcRequestPokemon(0, true);
    var pokeB = supposeActiveFoe(battle);
	var imfaster= compareSpeeds(pokeA.stats.spe, pokeB.stats.spe);

	var damageMoves = getViableDamageMoves(battle, decisions, pokeA, pokeB);
	var supportMoves = getViableSupportMoves(battle, decisions, pokeA, pokeB);
	var enemyMoves = getEnemyDamageMoves(battle, pokeA, pokeB);

	var ev = evaluatePokemon(battle, 0);
	var evNoMega = evaluatePokemon(battle, 0, true);

	debugBestMove(bestSW, damageMoves, supportMoves, enemyMoves);


	/* Special switch cases */

	var switchIfNoOption = false;
	var conditionsA = new Conditions({
		side: battle.self.side,
		volatiles: battle.self.active[0].volatiles,
		boosts: battle.self.active[0].boosts
	});

	if (bestSW) {
		if (Calc.getHazardsDamage(pokeA, conditionsA, battle.gen, !!battle.conditions["inversebattle"]) > pokeA.hp) bestSW = null; //No switch if you die
		if (conditionsA.volatiles["substitute"] && damageMoves.meh.length) bestSW = null;
		if (conditionsA.volatiles["leechseed"]) switchIfNoOption = true;
		if (conditionsA.boosts["spa"] && conditionsA.boosts["spa"] < 1) switchIfNoOption = true;
		if (conditionsA.boosts["atk"] && conditionsA.boosts["atk"] < 1) switchIfNoOption = true;
		if (conditionsA.volatiles["perish1"] && bestSW) return bestSW;

	}

	//Enemy can OHKO me
    if(enemyMoves.ohko.length>0){ //Can OHKO me
		if(imfaster){
            if (damageMoves.ohko.length) {
                if (supportMoves.sleepTalk) return supportMoves.sleepTalk;
                return damageMoves.ohko[Math.floor(Math.random() * damageMoves.ohko.length)];
            }
            else{
            	/*TODO: Logic for no OHKO but still faster, likely switch.*/
            	if(bestSW) return bestSW;
			}
		}
        else {
			var priokill =  damageMoves.ohko.find(isPriority);
			var prio = bestPrio;
			if(priokill) return priokill;
			else if(bestSW) return bestSW;
			else if(prio) return prio;
			//else just continue to normal situation
		}
		 /* TODO: Should check for Taunt and stuff here*/
    }

	/* Normal situations */
	if (damageMoves.ohko.length) {
		if (supportMoves.sleepTalk) return supportMoves.sleepTalk;
		return damageMoves.ohko[Math.floor(Math.random() * damageMoves.ohko.length)];
	} else if(supportMoves.recommended.length){
        return supportMoves.recommended[Math.floor(Math.random() * supportMoves.recommended.length)];
    } else if (damageMoves.thko.length) {
		if (supportMoves.sleepTalk) return supportMoves.sleepTalk;
		if (supportMoves.viable.length && (Math.random() * 100) > 50) {
			return supportMoves.viable[Math.floor(Math.random() * supportMoves.viable.length)];
		} else {
			return damageMoves.thko[Math.floor(Math.random() * damageMoves.thko.length)];
		}
	} else if (damageMoves.meh.length) {
		var moves = damageMoves.meh.concat(supportMoves.viable);
		if (bestSW) {
			var evBS = evaluatePokemon(battle, bestSW[0].pokeId);
			if ((evBS.t < ev.t && evBS.t < evNoMega.t) || (evBS.t === ev.t && evBS.d > ev.d)) {
				return bestSW;
			} else {
				if (supportMoves.sleepTalk) return supportMoves.sleepTalk;
				return moves[Math.floor(Math.random() * moves.length)];
			}
		} else {
			if (supportMoves.sleepTalk) return supportMoves.sleepTalk;
			return moves[Math.floor(Math.random() * moves.length)];
		}
	} else if (damageMoves.bad.length || supportMoves.viable.length) {
		var moves = damageMoves.bad.concat(supportMoves.viable);
		if (bestSW) {
			var evBS = evaluatePokemon(battle, bestSW[0].pokeId);
			if ((evBS.t < ev.t && evBS.t < evNoMega.t) || (evBS.t === ev.t && evBS.d > ev.d) || switchIfNoOption) {
				return bestSW;
			} else {
				if (supportMoves.sleepTalk) return supportMoves.sleepTalk;
				return moves[Math.floor(Math.random() * moves.length)];
			}
		} else {
			if (supportMoves.sleepTalk) return supportMoves.sleepTalk;
			return moves[Math.floor(Math.random() * moves.length)];
		}
	} else if (bestSW) {
		battle.self.active[0].helpers.hasNoViableMoves = battle.foe.active[0].name;
		return bestSW;
	} else {
		return decisions[Math.floor(Math.random() * decisions.length)];
	}
};

/*
* Switches
*/

var getBestSwitch = exports.getBestSwitch = function (battle, decisions) {
	var chosen = null;
	var tmp, maxi = null;
	for (var i = 0; i < decisions.length; i++) {
		if (decisions[i][0].type === "switch") {
			if (battle.foe.active[0] && !battle.foe.active[0].fainted && battle.self.pokemon[decisions[i][0].pokeId]) {
				var pk = battle.self.pokemon[decisions[i][0].pokeId];
				if (pk.helpers.hasNoViableMoves === battle.foe.active[0].name) continue;
			}
			tmp = evaluatePokemon(battle, decisions[i][0].pokeId);
			if (maxi === null) {
				maxi = tmp;
				chosen = decisions[i];
			} else if (maxi.t > tmp.t || (maxi.t === tmp.t && maxi.d < tmp.d)) {
				maxi = tmp;
				chosen = decisions[i];
			}
		}
	}
	return chosen;
};

//Download the entire team's common sets during TeamPreview
var downloadTeam = function(team, battle){

    var setPredictions = function(err, set, index){
    	// console.log("INDEX IS", index);
        //find the pokmeon
        var pokemon = battle.foe.pokemon[index];
        pokemon.helpers={};
        pokemon.helpers.possibleMoves=[];
        set.moveslots.forEach(function (move){
        	debug(move);
        	var moves = move.toString().split(',');
        	move= moves[Math.floor(Math.random() * moves.length)];
        	var template= battleData.getMove(move.toString(), battle.gen);
        	pokemon.helpers.possibleMoves.push(new Move(template))
		});
        // pokemon.helpers.possibleMoves=set.moveslots;
        pokemon.helpers.possibleAbility=set.abilities;
        pokemon.helpers.possibleEVs = set.evconfigs;
        pokemon.helpers.possibleNature = set.natures;
        pokemon.helpers.possibleItem = set.items[0];
        // debug("Finished Predicting "+ pokemon.species);
        // console.log(JSON.stringify(pokemon.helpers, null, 4));
    };

	team.forEach(function(pokemon, index){
		Smogon.downloadSet(pokemon.species, "sm", setPredictions, index);
	})
};

//Checks if the pokemon can set entry hazards
var hasEntryHazards= function(pokemon){
	var hazards=['stealthrock', 'spikes', 'toxicspikes', 'stickyweb'];

    var yes = pokemon.moves.some(function (move) {
        return hazards.includes(move.id);
    });
    return yes;
};

//Checks if the Pokemon has the ability to set up weather automatically
var isWeatherSetter = function(pokemon, self){
    var setters=['Vulpix', 'Ninetales', 'Groudon', 'Kyogre', 'Snover', 'Abomasnow', 'Tyranitar', 'Politoed', 'Pelipper', 'Torkoal', 'Hippopotas', 'Hippowdown','Gigalith'];
    return (
    	setters.includes(pokemon.species)
	)
};

var isManualSetter =  function(pokemon){
    var moves=['Rain Dance', 'Sunny Day', 'Sandstorm', 'Hail', 'Trick Room', 'Reflect', 'Light Screen'];
    return pokemon.moves.some(function (move){
        return moves.includes(move.name);
    })
};

//Checks if the option has any tools to counter enemy lead
var canCounterHazards = function(pokemon){
    var moves=['Taunt', 'Rapid Spin', 'Defog'];
    // console.log(JSON.stringify(pokemon, null, 4));

    return (
    	pokemon.species ==="Sableye" ||
		pokemon.species ==="Absol" ||
    	pokemon.template.abilities['0']== "Magic Bounce" ||
        pokemon.template.abilities['1']== "Magic Bounce" ||
        pokemon.template.abilities['H']== "Magic Bounce" ||
        pokemon.moves.some(function (move){
            return moves.includes(move.name);
        })
    )
};

var getBestLead = function(battle, decisions){
    debug("GET BEST LEAD - MY TEAM");
    var great=[];
    var good =[];
    var cool =[];
    var ok=[];
    var fail=[];
    // debug("GAMESTATE!");
    // console.log(JSON.stringify(battle.self.pokemon[0] ,null,4));
	battle.self.pokemon.forEach(function(poke, index){
		if(isWeatherSetter(poke)) great.push(index);
        if(isManualSetter(poke)) cool.push(index);
        else if(hasEntryHazards(poke)) good.push(index);
        else if(canCounterHazards(poke)) ok.push(index);
        else fail.push(index);
    });
    if(great.length>0) {
    	return decisions[great[Math.floor(Math.random() * great.length)]];
	}
    else if(good.length>0) {
        return decisions[good[Math.floor(Math.random() * good.length)]];
    }
    else if(cool.length>0) {
        return decisions[cool[Math.floor(Math.random() * cool.length)]];
    }
	else if(ok.length>0){
		return decisions[ok[Math.floor(Math.random() * ok.length)]];
	}
	else
		return decisions[Math.floor(Math.random() * decisions.length)];
};

var getMyMoves= function (poke, move) {
    if(move.length<=0){
        return;
    }

    var moveTemplate = battleData.getMove(move, this.gen);

    move = new Move(moveTemplate);
    if (poke.transformed) move.pp = 5;
    poke.moves.push(move);

};

var setStartingMoves = function(battle){
    // debug("REQUES!!!");
    // console.log(battle.request);
    battle.request.side.pokemon.forEach(function(poke, index){
        getMyMoves(battle.self.pokemon[index], poke.moves[0]);
        getMyMoves(battle.self.pokemon[index], poke.moves[1]);
        getMyMoves(battle.self.pokemon[index], poke.moves[2]);
        getMyMoves(battle.self.pokemon[index], poke.moves[3]);
    });
};

/*
* MUX
*/
exports.decide = function (battle, decisions) {
	if (battle.gametype !== "singles") throw new Error("This module only works for singles gametype");

    if (battle.request.forceSwitch) {
		return getBestSwitch(battle, decisions);
	} else if (battle.request.active) {
    	//DEBUG CODE
        // debug("GAMESTATE!");
        // console.log(JSON.stringify(battle ,null,4));
        //END DEBUG CODE
		return getBestMove(battle, decisions);
	} else if (battle.request.teamPreview) {
        downloadTeam(battle.foe.teamPv, battle);
        setStartingMoves(battle);
        return getBestLead(battle, decisions);
    } else {
		return decisions[Math.floor(Math.random() * decisions.length)];
	}
};

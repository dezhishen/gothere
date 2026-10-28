// 生成物，请不要手改——运行 `pnpm types` 重新生成。
// 权威来源：types/<category>/<kind>.type.json（共 11 个类型，清单见 types/manifest.json）。
// 新增一种机关或物品只需要加一个 JSON 文件，这里会跟着变，代码不用动。
export const CONTENT_TYPES = Object.freeze({
  "map": Object.freeze({}),
  "mechanism": Object.freeze({
      "switch": {
        "version": 1,
        "defaultWidth": 28,
        "iconOffset": 91,
        "art": "lever",
        "states": [
          {
            "id": "off",
            "label": "待触发"
          },
          {
            "id": "on",
            "label": "已触发"
          }
        ],
        "slots": {
          "reacts": {
            "on": "input",
            "from": "off",
            "actions": [
              {
                "type": "become",
                "state": "on"
              }
            ]
          }
        }
      },
      "bridge": {
        "version": 1,
        "defaultWidth": 28,
        "iconOffset": 91,
        "states": [
          {
            "id": "folded",
            "label": "收起"
          },
          {
            "id": "extended",
            "label": "已铺好"
          }
        ],
        "slots": {
          "ground": {
            "inState": "extended"
          }
        }
      },
      "gate": {
        "version": 1,
        "defaultWidth": 28,
        "iconOffset": 91,
        "states": [
          {
            "id": "closed",
            "label": "关闭"
          },
          {
            "id": "open",
            "label": "开启"
          }
        ],
        "slots": {
          "blocks": {
            "inState": "closed",
            "reason": "gate",
            "message": "门：此路暂时不通。先找个办法打开它。"
          }
        }
      },
      "hazard": {
        "version": 1,
        "defaultWidth": 28,
        "iconOffset": 135,
        "art": "fan",
        "states": [
          {
            "id": "running",
            "label": "转动中"
          },
          {
            "id": "stopped",
            "label": "已停下"
          }
        ],
        "slots": {
          "reacts": {
            "on": "input",
            "from": "running",
            "actions": [
              {
                "type": "become",
                "state": "stopped"
              }
            ]
          },
          "blocks": {
            "inState": "running",
            "reason": "hazard",
            "message": "风太大，被吹了个措手不及。经过之前先关风扇。"
          }
        }
      },
      "plate": {
        "version": 1,
        "defaultWidth": 28,
        "iconOffset": 91,
        "states": [
          {
            "id": "idle",
            "label": "等待踩下"
          },
          {
            "id": "pressed",
            "label": "已踩下"
          }
        ],
        "slots": {
          "reacts": {
            "on": "contact",
            "from": "idle",
            "actions": [
              {
                "type": "become",
                "state": "pressed"
              },
              {
                "type": "publish",
                "event": "enter"
              }
            ]
          }
        }
      },
      "lift": {
        "version": 1,
        "defaultWidth": 70,
        "iconOffset": 120,
        "states": [
          {
            "id": "lower",
            "label": "停在楼下"
          },
          {
            "id": "upper",
            "label": "停在楼上"
          }
        ],
        "slots": {
          "lifts": {}
        }
      },
      "guard": {
        "version": 1,
        "defaultWidth": 34,
        "iconOffset": 96,
        "states": [
          {
            "id": "patrolling",
            "label": "巡逻中"
          },
          {
            "id": "stopped",
            "label": "暂时停下"
          }
        ],
        "slots": {
          "moves": {
            "inState": "patrolling",
            "speed": 48,
            "between": [
              300,
              400
            ]
          },
          "harms": {
            "inState": "patrolling",
            "reason": "hurt",
            "message": "巡逻的守卫撞上了他。"
          },
          "reacts": {
            "on": "input",
            "from": "patrolling",
            "actions": [
              {
                "type": "become",
                "state": "stopped"
              }
            ]
          }
        }
      },
      "crusher": {
        "version": 1,
        "defaultWidth": 44,
        "iconOffset": 96,
        "states": [
          {
            "id": "active",
            "label": "来回碾压"
          },
          {
            "id": "parked",
            "label": "停在一侧"
          }
        ],
        "slots": {
          "moves": {
            "inState": "active",
            "speed": 36,
            "between": [
              300,
              400
            ]
          },
          "blocks": {
            "inState": "active",
            "reason": "crusher",
            "message": "碎石机来回碾压，过不去。"
          }
        }
      },
    }),
  "item": Object.freeze({
      "axe": {
        "version": 1,
        "defaultWidth": 34,
        "iconOffset": 96,
        "states": [
          {
            "id": "idle",
            "label": "放在地上"
          },
          {
            "id": "held",
            "label": "已举起"
          }
        ],
        "slots": {
          "carryable": {},
          "harms": {
            "inState": "idle",
            "unlessHeld": true,
            "reason": "hurt",
            "message": "地上的斧头可不认人。"
          },
          "reacts": {
            "on": "input",
            "from": "held",
            "actions": [
              {
                "type": "become",
                "state": "idle"
              }
            ]
          }
        }
      },
      "hammer": {
        "version": 1,
        "defaultWidth": 32,
        "iconOffset": 96,
        "states": [
          {
            "id": "idle",
            "label": "放在地上"
          },
          {
            "id": "held",
            "label": "握在手里"
          }
        ],
        "slots": {
          "carryable": {},
          "reacts": {
            "on": "input",
            "from": "held",
            "actions": []
          }
        }
      },
      "key": {
        "version": 1,
        "defaultWidth": 20,
        "iconOffset": 92,
        "states": [
          {
            "id": "idle",
            "label": "落在地上"
          },
          {
            "id": "held",
            "label": "握在手里"
          },
          {
            "id": "used",
            "label": "用掉了"
          }
        ],
        "slots": {
          "carryable": {}
        },
        "tags": [
          "key",
          "yellow"
        ],
        "hiddenStates": [
          "used"
        ],
        "consumedState": "used"
      },
    }),
});

/** 每个类别实际用到的数据文件顺序（与 types/manifest.json 一致）。 */
export const TYPE_FILES = Object.freeze({
  "map": Object.freeze([]),
  "mechanism": Object.freeze(["mechanism/switch.type.json", "mechanism/bridge.type.json", "mechanism/gate.type.json", "mechanism/hazard.type.json", "mechanism/plate.type.json", "mechanism/lift.type.json", "mechanism/guard.type.json", "mechanism/crusher.type.json"]),
  "item": Object.freeze(["item/axe.type.json", "item/hammer.type.json", "item/key.type.json"]),
});

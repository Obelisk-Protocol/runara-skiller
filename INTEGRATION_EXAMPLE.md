# Action-Based Skill Training Integration

## Overview

This system provides a simple, action-based approach to skill training. Artists can paint actions in the game engine, and when players perform those actions, they automatically gain experience in the associated skill.

## How It Works

1. **Actions are mapped to skills** - Each action (like "mine_rock") is mapped to a specific skill (like "mining")
2. **Simple API call** - When a player performs an action, call the API with the action and experience gained
3. **Automatic skill progression** - The system handles all the skill calculations, leveling, and database updates

## API Endpoints

### Get Available Actions
```bash
GET /api/skill-training/actions
```

Response:
```json
{
  "success": true,
  "actions": [
    {
      "action": "mine_rock",
      "skill": "mining",
      "description": "Mining rocks and ores"
    },
    {
      "action": "chop_tree",
      "skill": "woodcutting", 
      "description": "Cutting down trees"
    }
    // ... more actions
  ]
}
```

### Train a Skill
```bash
POST /api/skill-training/train
```

Request:
```json
{
  "assetId": "your-character-asset-id",
  "action": "mine_rock",
  "expGained": 25,
  "playerPDA": "optional-player-pda",
  "sessionId": "optional-session-id",
  "gameMode": "optional-game-mode",
  "additionalData": {
    "rockType": "iron",
    "location": "mountain_cave"
  }
}
```

Response:
```json
{
  "success": true,
  "message": "Successfully trained mining via mine_rock",
  "result": {
    "skill": "mining",
    "level": 15,
    "experience": 1250,
    "leveledUp": true,
    "progressPct": 45.2
  }
}
```

### Get Training History
```bash
GET /api/skill-training/history/{assetId}?limit=50&offset=0
```

## Integration with Obelisk Engine

### 1. Define Actions in Your Game

In your game engine, define actions that players can perform:

```typescript
// Example action definitions
const GAME_ACTIONS = {
  // Mining actions
  MINE_IRON_ORE: { action: 'mine_rock', exp: 25, skill: 'mining' },
  MINE_GOLD_ORE: { action: 'mine_rock', exp: 50, skill: 'mining' },
  
  // Woodcutting actions
  CHOP_OAK_TREE: { action: 'chop_tree', exp: 30, skill: 'woodcutting' },
  CHOP_PINE_TREE: { action: 'chop_tree', exp: 20, skill: 'woodcutting' },
  
  // Combat actions
  ATTACK_GOBLIN: { action: 'attack_enemy', exp: 40, skill: 'attack' },
  DEFEND_ATTACK: { action: 'defend', exp: 15, skill: 'defense' },
  
  // Crafting actions
  SMITH_SWORD: { action: 'smith_weapon', exp: 100, skill: 'smithing' },
  COOK_FISH: { action: 'cook_food', exp: 35, skill: 'cooking' }
};
```

### 2. Call the API When Actions Are Performed

```typescript
async function performAction(assetId: string, actionKey: string) {
  const action = GAME_ACTIONS[actionKey];
  if (!action) return;
  
  try {
    const response = await fetch('/api/skill-training/train', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assetId,
        action: action.action,
        expGained: action.exp,
        additionalData: {
          actionKey,
          timestamp: Date.now()
        }
      })
    });
    
    const result = await response.json();
    if (result.success) {
      console.log(`🎯 ${result.message}`);
      if (result.result.leveledUp) {
        console.log(`🎉 Level up! ${result.result.skill} is now level ${result.result.level}`);
      }
    }
  } catch (error) {
    console.error('Failed to train skill:', error);
  }
}
```

### 3. Artist Integration

Artists can now paint actions directly in the game engine:

1. **Paint a mining node** → Set action to "mine_rock" with appropriate exp value
2. **Paint a tree** → Set action to "chop_tree" with appropriate exp value  
3. **Paint a forge** → Set action to "smith_weapon" with appropriate exp value
4. **Paint a cooking station** → Set action to "cook_food" with appropriate exp value

The system automatically handles:
- ✅ Skill level calculations
- ✅ Experience requirements
- ✅ Level-up notifications
- ✅ Database synchronization
- ✅ Blockchain updates (when configured)

## Available Actions

### Combat Skills
- `attack_enemy` → attack
- `strength_training` → strength  
- `defend` → defense
- `cast_spell` → magic
- `shoot_arrow` → projectiles
- `heal` → vitality

### Gathering Skills
- `mine_rock` → mining
- `chop_tree` → woodcutting
- `fish` → fishing
- `farm_crop` → farming
- `hunt_animal` → hunting

### Crafting Skills
- `smith_weapon` → smithing
- `craft_item` → crafting
- `cook_food` → cooking
- `brew_potion` → alchemy
- `build_structure` → construction

### Unique Skills
- `gamble` → luck

## Benefits

1. **Simple Integration** - Just call one API endpoint
2. **Artist Friendly** - Actions are intuitive and easy to understand
3. **Flexible** - Easy to add new actions and skills
4. **Scalable** - Handles all the complex skill calculations automatically
5. **Trackable** - Full history of all training activities
6. **Extensible** - Additional data can be stored with each training session

This system makes it easy for your artists to create engaging skill-based content without worrying about the complex backend logic!

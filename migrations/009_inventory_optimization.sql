-- ============================================
-- INVENTORY FLOW OPTIMIZATION MIGRATION
-- Date: January 2025
-- Purpose: Add slot_position and optimize inventory operations
-- ============================================

-- ============================================
-- PART 1: ADD slot_position COLUMN
-- ============================================

-- Add slot_position to player_items (CRITICAL for inventory management)
ALTER TABLE player_items 
ADD COLUMN IF NOT EXISTS slot_position INTEGER;

-- Create index for slot queries
CREATE INDEX IF NOT EXISTS idx_player_items_slot_position 
ON player_items(player_id, slot_position);

-- Backfill existing items (assign slots 0-29 based on minted_at order)
-- Only assign slots to first 30 items per player (inventory size limit)
WITH numbered_items AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY minted_at DESC) - 1 as slot_num
  FROM player_items
  WHERE slot_position IS NULL
)
UPDATE player_items pi
SET slot_position = ni.slot_num
FROM numbered_items ni
WHERE pi.id = ni.id AND ni.slot_num < 30;

-- Set slot_position to NULL for items beyond inventory limit (they're in overflow/storage)
UPDATE player_items
SET slot_position = NULL
WHERE slot_position IS NOT NULL AND slot_position >= 30;

-- ============================================
-- PART 2: CREATE move_inventory_item FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION move_inventory_item(
  p_player_id UUID,
  p_from_slot INTEGER,
  p_to_slot INTEGER,
  p_quantity INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_from_item RECORD;
  v_to_item RECORD;
  v_item_def RECORD;
  v_from_quantity INTEGER;
  v_to_quantity INTEGER;
  v_max_stack INTEGER;
  v_is_same_item BOOLEAN;
  v_result JSONB;
BEGIN
  -- Validate slot range
  IF p_from_slot < 0 OR p_from_slot >= 30 OR p_to_slot < 0 OR p_to_slot >= 30 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid slot range. Slots must be 0-29.'
    );
  END IF;

  -- Get from_item by slot position (with lock for update)
  SELECT * INTO v_from_item
  FROM player_items
  WHERE player_id = p_player_id AND slot_position = p_from_slot
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No item at source slot'
    );
  END IF;

  -- Get item definition for max_stack_size
  SELECT * INTO v_item_def
  FROM item_definitions
  WHERE item_id = v_from_item.item_definition_id;

  -- Get to_item by slot position (with lock for update)
  SELECT * INTO v_to_item
  FROM player_items
  WHERE player_id = p_player_id AND slot_position = p_to_slot
  FOR UPDATE;

  -- Validate quantity
  IF p_quantity <= 0 OR p_quantity > v_from_item.quantity THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid quantity'
    );
  END IF;

  -- Calculate new quantities
  v_from_quantity := v_from_item.quantity - p_quantity;
  v_is_same_item := v_to_item.item_definition_id = v_from_item.item_definition_id;
  v_max_stack := COALESCE(v_item_def.max_stack_size, 1);

  -- Case 1: Moving to empty slot
  IF NOT FOUND THEN
    IF v_from_quantity = 0 THEN
      -- Move entire stack to empty slot
      UPDATE player_items
      SET slot_position = p_to_slot
      WHERE id = v_from_item.id;
    ELSE
      -- Split stack: create new item in target slot, update source
      INSERT INTO player_items (
        player_id, item_definition_id, cnft_address, mint_signature,
        quantity, mint_cost, is_stacked, acquisition_source,
        slot_position, minted_at
      )
      VALUES (
        p_player_id, v_from_item.item_definition_id,
        'item_' || p_player_id::text || '_' || v_from_item.item_definition_id || '_' || EXTRACT(EPOCH FROM NOW())::bigint,
        'mint_split_' || v_from_item.id::text,
        p_quantity, v_from_item.mint_cost, v_from_item.is_stacked,
        'inventory_move', p_to_slot, NOW()
      );
      
      UPDATE player_items
      SET quantity = v_from_quantity
      WHERE id = v_from_item.id;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'move',
      'from_slot', p_from_slot,
      'to_slot', p_to_slot,
      'quantity', p_quantity
    );
  END IF;

  -- Case 2: Stacking same item
  IF v_is_same_item AND v_max_stack > 1 THEN
    v_to_quantity := v_to_item.quantity + p_quantity;
    
    IF v_to_quantity <= v_max_stack THEN
      -- Fits in stack
      IF v_from_quantity = 0 THEN
        -- Remove source item
        DELETE FROM player_items WHERE id = v_from_item.id;
      ELSE
        -- Update source quantity
        UPDATE player_items SET quantity = v_from_quantity WHERE id = v_from_item.id;
      END IF;
      
      -- Update target quantity
      UPDATE player_items SET quantity = v_to_quantity WHERE id = v_to_item.id;

      RETURN jsonb_build_object(
        'success', true,
        'action', 'stack',
        'from_slot', p_from_slot,
        'to_slot', p_to_slot,
        'quantity', p_quantity,
        'new_quantity', v_to_quantity
      );
    ELSE
      -- Overflow - fill target stack, keep remainder in source
      DECLARE
        v_overflow INTEGER;
      BEGIN
        v_overflow := v_to_quantity - v_max_stack;
        v_to_quantity := v_max_stack;
        
        UPDATE player_items SET quantity = v_to_quantity WHERE id = v_to_item.id;
        UPDATE player_items SET quantity = v_from_quantity + v_overflow WHERE id = v_from_item.id;

        RETURN jsonb_build_object(
          'success', true,
          'action', 'stack_overflow',
          'from_slot', p_from_slot,
          'to_slot', p_to_slot,
          'quantity', p_quantity,
          'stacked', p_quantity - v_overflow,
          'remaining', v_overflow
        );
      END;
    END IF;
  END IF;

  -- Case 3: Swapping different items (or same item but not stackable)
  -- Swap slot positions
  UPDATE player_items SET slot_position = NULL WHERE id = v_from_item.id;
  UPDATE player_items SET slot_position = p_from_slot WHERE id = v_to_item.id;
  UPDATE player_items SET slot_position = p_to_slot WHERE id = v_from_item.id;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'swap',
    'from_slot', p_from_slot,
    'to_slot', p_to_slot,
    'quantity', p_quantity
  );
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION move_inventory_item(UUID, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION move_inventory_item(UUID, INTEGER, INTEGER, INTEGER) TO service_role;

-- ============================================
-- PART 3: CREATE award_items_batch FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION award_items_batch(
  p_player_id UUID,
  p_items JSONB,
  p_source TEXT DEFAULT 'game_reward'
) RETURNS JSONB AS $$
DECLARE
  v_item JSONB;
  v_item_def RECORD;
  v_existing RECORD;
  v_result JSONB := '[]'::JSONB;
  v_awarded_item JSONB;
BEGIN
  -- Loop through items array
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    DECLARE
      v_item_id TEXT := v_item->>'itemId';
      v_quantity INTEGER := (v_item->>'quantity')::INTEGER;
      v_cnft_address TEXT;
      v_new_quantity INTEGER;
    BEGIN
      -- Get item definition
      SELECT * INTO v_item_def
      FROM item_definitions
      WHERE item_id = v_item_id AND is_active = true;

      IF NOT FOUND THEN
        CONTINUE; -- Skip invalid items
      END IF;

      -- Check if player already has this item (for stackable items)
      IF v_item_def.max_stack_size > 1 THEN
        SELECT * INTO v_existing
        FROM player_items
        WHERE player_id = p_player_id 
          AND item_definition_id = v_item_id
          AND slot_position IS NOT NULL
        ORDER BY quantity ASC
        LIMIT 1
        FOR UPDATE;

        IF FOUND THEN
          -- Stack onto existing item
          v_new_quantity := v_existing.quantity + v_quantity;
          
          IF v_new_quantity <= v_item_def.max_stack_size THEN
            -- Fits in existing stack
            UPDATE player_items
            SET quantity = v_new_quantity
            WHERE id = v_existing.id;

            v_awarded_item := jsonb_build_object(
              'itemId', v_item_id,
              'quantity', v_quantity,
              'action', 'stacked',
              'itemId', v_existing.id
            );
          ELSE
            -- Overflow - fill existing, create new
            DECLARE
              v_overflow INTEGER;
              v_empty_slot INTEGER;
              v_new_item_id UUID;
            BEGIN
              v_overflow := v_new_quantity - v_item_def.max_stack_size;
              
              UPDATE player_items
              SET quantity = v_item_def.max_stack_size
              WHERE id = v_existing.id;

              -- Find empty slot for new stack
              SELECT COALESCE(MAX(slot_position), -1) + 1 INTO v_empty_slot
              FROM player_items
              WHERE player_id = p_player_id AND slot_position IS NOT NULL;

              IF v_empty_slot >= 30 THEN
                -- No empty slots, create overflow item (slot_position = NULL)
                v_empty_slot := NULL;
              END IF;

              v_cnft_address := 'item_' || p_player_id::text || '_' || v_item_id || '_' || EXTRACT(EPOCH FROM NOW())::bigint;
              
              INSERT INTO player_items (
                player_id, item_definition_id, cnft_address, mint_signature,
                quantity, mint_cost, is_stacked, acquisition_source,
                slot_position, minted_at
              )
              VALUES (
                p_player_id, v_item_id, v_cnft_address, 'mint_batch_' || v_cnft_address,
                v_overflow, v_item_def.mint_cost_cobx, true, p_source,
                v_empty_slot, NOW()
              )
              RETURNING id INTO v_new_item_id;

              v_awarded_item := jsonb_build_object(
                'itemId', v_item_id,
                'quantity', v_quantity,
                'action', 'stacked_and_created',
                'stackedItemId', v_existing.id,
                'newItemId', v_new_item_id
              );
            END;
          END IF;
        ELSE
          -- No existing item, create new stackable item
          DECLARE
            v_empty_slot INTEGER;
            v_new_item_id UUID;
          BEGIN
            SELECT COALESCE(MAX(slot_position), -1) + 1 INTO v_empty_slot
            FROM player_items
            WHERE player_id = p_player_id AND slot_position IS NOT NULL;

            IF v_empty_slot >= 30 THEN
              v_empty_slot := NULL; -- Overflow
            END IF;

            v_cnft_address := 'item_' || p_player_id::text || '_' || v_item_id || '_' || EXTRACT(EPOCH FROM NOW())::bigint;
            
            INSERT INTO player_items (
              player_id, item_definition_id, cnft_address, mint_signature,
              quantity, mint_cost, is_stacked, acquisition_source,
              slot_position, minted_at
            )
            VALUES (
              p_player_id, v_item_id, v_cnft_address, 'mint_batch_' || v_cnft_address,
              v_quantity, v_item_def.mint_cost_cobx, true, p_source,
              v_empty_slot, NOW()
            )
            RETURNING id INTO v_new_item_id;

            v_awarded_item := jsonb_build_object(
              'itemId', v_item_id,
              'quantity', v_quantity,
              'action', 'created',
              'itemId', v_new_item_id
            );
          END;
        END IF;
      ELSE
        -- Non-stackable item, create new
        DECLARE
          v_empty_slot INTEGER;
          v_new_item_id UUID;
        BEGIN
          SELECT COALESCE(MAX(slot_position), -1) + 1 INTO v_empty_slot
          FROM player_items
          WHERE player_id = p_player_id AND slot_position IS NOT NULL;

          IF v_empty_slot >= 30 THEN
            v_empty_slot := NULL; -- Overflow
          END IF;

          v_cnft_address := 'item_' || p_player_id::text || '_' || v_item_id || '_' || EXTRACT(EPOCH FROM NOW())::bigint;
          
          INSERT INTO player_items (
            player_id, item_definition_id, cnft_address, mint_signature,
            quantity, mint_cost, is_stacked, acquisition_source,
            slot_position, minted_at
          )
          VALUES (
            p_player_id, v_item_id, v_cnft_address, 'mint_batch_' || v_cnft_address,
            v_quantity, v_item_def.mint_cost_cobx, false, p_source,
            v_empty_slot, NOW()
          )
          RETURNING id INTO v_new_item_id;

          v_awarded_item := jsonb_build_object(
            'itemId', v_item_id,
            'quantity', v_quantity,
            'action', 'created',
            'itemId', v_new_item_id
          );
        END;
      END IF;

      -- Add to result array
      v_result := v_result || v_awarded_item;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'items', v_result,
    'count', jsonb_array_length(v_result)
  );
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION award_items_batch(UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION award_items_batch(UUID, JSONB, TEXT) TO service_role;


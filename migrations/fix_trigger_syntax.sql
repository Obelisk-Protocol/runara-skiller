-- ============================================
-- Migration: Fix duplicate EXECUTE FUNCTION in triggers
-- Date: 2025-11-04
-- Description: Removes duplicate EXECUTE FUNCTION clauses from triggers
-- ============================================

-- Drop existing triggers with duplicate EXECUTE FUNCTION
DROP TRIGGER IF EXISTS trigger_update_chunks_updated_at ON chunks;
DROP TRIGGER IF EXISTS trg_update_map_editor_animations_updated_at ON map_editor_animations;
DROP TRIGGER IF EXISTS update_map_editor_collisions_updated_at ON map_editor_collisions;
DROP TRIGGER IF EXISTS trigger_update_map_saves_updated_at ON map_saves;
DROP TRIGGER IF EXISTS trigger_update_nft_total_level ON nfts;
DROP TRIGGER IF EXISTS update_player_skill_experience_updated_at ON player_skill_experience;
DROP TRIGGER IF EXISTS trg_quests_updated_at ON quests;

-- Recreate triggers with correct syntax (single EXECUTE FUNCTION)
CREATE TRIGGER trigger_update_chunks_updated_at 
    BEFORE UPDATE ON chunks 
    FOR EACH ROW 
    EXECUTE FUNCTION update_chunks_updated_at();

CREATE TRIGGER trg_update_map_editor_animations_updated_at 
    BEFORE UPDATE ON map_editor_animations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_map_editor_animations_updated_at();

CREATE TRIGGER update_map_editor_collisions_updated_at 
    BEFORE UPDATE ON map_editor_collisions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_map_saves_updated_at 
    BEFORE UPDATE ON map_saves 
    FOR EACH ROW 
    EXECUTE FUNCTION update_map_saves_updated_at();

CREATE TRIGGER trigger_update_nft_total_level 
    BEFORE INSERT ON nfts 
    FOR EACH ROW 
    EXECUTE FUNCTION update_nft_total_level();

CREATE TRIGGER trigger_update_nft_total_level_update 
    BEFORE UPDATE ON nfts 
    FOR EACH ROW 
    EXECUTE FUNCTION update_nft_total_level();

CREATE TRIGGER update_player_skill_experience_updated_at 
    BEFORE UPDATE ON player_skill_experience 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_quests_updated_at 
    BEFORE UPDATE ON quests 
    FOR EACH ROW 
    EXECUTE FUNCTION set_updated_at();


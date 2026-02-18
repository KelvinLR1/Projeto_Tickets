import sqlite3

def merge_sectors():
    conn = sqlite3.connect('tickets_system.db')
    cursor = conn.cursor()
    
    # Busca os setores "SUPORTE" ou "suporte" (case-insensitive)
    cursor.execute("SELECT id, name FROM sectors WHERE UPPER(name) = 'SUPORTE'")
    sectors = cursor.fetchall()
    
    if len(sectors) <= 1:
        print("Nenhum setor duplicado encontrado.")
        conn.close()
        return

    print(f"Setores encontrados: {sectors}")
    
    # Define o primeiro como o canônico (ID menor)
    canonical_id = min(s[0] for s in sectors)
    others = [s[0] for s in sectors if s[0] != canonical_id]
    
    print(f"Mantendo ID {canonical_id} como principal. Removendo IDs: {others}")
    
    # Atualiza Status
    for other_id in others:
        cursor.execute("UPDATE statuses SET sector_id = ? WHERE sector_id = ?", (canonical_id, other_id))
        cursor.execute("UPDATE categories SET sector_id = ? WHERE sector_id = ?", (canonical_id, other_id))
        cursor.execute("UPDATE tickets SET sector_id = ? WHERE sector_id = ?", (canonical_id, other_id))
        
        # User sectors - evita duplicatas no INSERT se o usuário já tiver o principal
        cursor.execute("SELECT user_id FROM user_sectors WHERE sector_id = ?", (other_id,))
        users_to_migrate = cursor.fetchall()
        for (user_id,) in users_to_migrate:
            cursor.execute("SELECT 1 FROM user_sectors WHERE user_id = ? AND sector_id = ?", (user_id, canonical_id))
            if not cursor.fetchone():
                cursor.execute("INSERT INTO user_sectors (user_id, sector_id) VALUES (?, ?)", (user_id, canonical_id))
        
        cursor.execute("DELETE FROM user_sectors WHERE sector_id = ?", (other_id,))
        cursor.execute("DELETE FROM sectors WHERE id = ?", (other_id,))

    conn.commit()
    print("Setores mesclados com sucesso!")
    conn.close()

if __name__ == '__main__':
    merge_sectors()

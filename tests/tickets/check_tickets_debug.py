import sys
import os

# Adiciona o diretório server ao path
server_dir = os.path.join(os.getcwd(), 'server')
sys.path.append(server_dir)

try:
    from server import database, models, crud
except ImportError:
    import database, models, crud

db = database.SessionLocal()

output_file = "debug_formatted.txt"

with open(output_file, "w", encoding="utf-8") as f:
    f.write("--- Tickets currently in Monitor (unassigned_only=True, exclude_finalized=True) ---\n")
    tickets = crud.get_tickets(db, unassigned_only=True, exclude_finalized=True)
    f.write(f"Count: {len(tickets)}\n")
    
    f.write("\n--- Checking for Mismatches ---\n")
    all_tickets = db.query(models.Ticket).all()
    for t in all_tickets:
        status_name_obj = t.status_obj.name if t.status_obj else "N/A"
        is_final = t.status_obj.is_final if t.status_obj else False
        
        # 1. Status string mismatch with Status object name?
        if t.status != status_name_obj:
            f.write(f"MISMATCH: Ticket {t.id} - String status: '{t.status}', Object status: '{status_name_obj}'\n")

        # 2. Does the status string look finalized?
        final_words = ["finalizado", "encerrado", "concluido", "resolvido", "cancelado"]
        is_string_final = any(word in t.status.lower() for word in final_words)
        
        if is_string_final and not is_final:
            f.write(f"WARNING: Ticket {t.id} has string status '{t.status}' (looks final) but Object is_final={is_final}\n")

    f.write("\n--- All Statuses ---\n")
    statuses = db.query(models.Status).all()
    for s in statuses:
        f.write(f"Status {s.id}: {s.name} | is_final: {s.is_final}\n")

db.close()

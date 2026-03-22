from sqlalchemy.orm import Session
from server.database import SessionLocal
from server.models import Ticket, Status

db = SessionLocal()

try:
    # Ensure default statuses exist
    default_statuses = {
        'open': {'name': 'Aberto', 'color': '#ef4444'},
        'in_progress': {'name': 'Em Progresso', 'color': '#eab308'},
        'closed': {'name': 'Concluído', 'color': '#22c55e'}
    }

    print("Checking statuses...")
    status_map = {}
    for key, data in default_statuses.items():
        # Check by name (using the display name as key for lookup)
        # But wait, original status was 'open', 'in_progress', 'closed' strings in DB?
        # Let's check what's actually in DB for a few tickets.
        pass

    # Fetch unique statuses from tickets
    existing_status_strings = db.query(Ticket.status).distinct().all()
    print(f"Found ticket statuses: {[s[0] for s in existing_status_strings]}")

    # Create Status objects if they don't exist
    for (status_str,) in existing_status_strings:
        if not status_str: continue
        
        # Map old strings to new names/colors
        name = status_str
        color = "#3b82f6" # Default blue
        
        if status_str == 'open':
            name = 'Aberto'
            color = '#ef4444'
        elif status_str == 'in_progress':
            name = 'Em Progresso'
            color = '#eab308'
        elif status_str == 'closed':
            name = 'Concluído'
            color = '#22c55e'
            
        # Check if status exists by name
        status_obj = db.query(Status).filter(Status.name == name).first()
        if not status_obj:
            print(f"Creating status: {name}")
            status_obj = Status(name=name, color=color)
            db.add(status_obj)
            db.commit()
            db.refresh(status_obj)
        
        status_map[status_str] = status_obj.id

    print("Backfilling tickets...")
    tickets = db.query(Ticket).filter(Ticket.status_id == None).all()
    for ticket in tickets:
        if ticket.status in status_map:
            ticket.status_id = status_map[ticket.status]
            # Update the status string to match the new Status object name for consistency
            ticket.status = db.query(Status).get(ticket.status_id).name
    
    db.commit()
    print(f"Updated {len(tickets)} tickets.")

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
finally:
    db.close()

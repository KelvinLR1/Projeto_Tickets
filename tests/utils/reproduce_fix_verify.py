import os
import sys

# Add the server directory to sys.path
sys.path.append(os.path.join(os.getcwd(), 'server'))

try:
    from server import models
except ImportError:
    import models

class MockTicket:
    def __init__(self, **kwargs):
        print("Instantiating MockTicket with:", kwargs)

# Assign models.Ticket to our mock for testing logic
orig_ticket = models.Ticket
models.Ticket = MockTicket

def test_reproduction():
    ticket_data = {
        "title": "Test Title",
        "description": "Test Desc",
        "assigned_user_id": 10
    }
    
    # Simulating logic in create_ticket_simple before fix:
    # assigned_user = ticket_data.get("assigned_user_id")
    # db_ticket = models.Ticket(**ticket_data, assigned_user_id=assigned_user)
    
    # Simulating logic in create_ticket_simple after fix:
    assigned_user = ticket_data.pop("assigned_user_id", None)
    
    try:
        db_ticket = models.Ticket(
            **ticket_data,
            assigned_user_id=assigned_user
        )
        print("Success: Ticket instantiated without duplicate keyword arguments.")
    except TypeError as e:
        print(f"Failure: {e}")

if __name__ == "__main__":
    test_reproduction()

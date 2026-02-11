# Notification CRUD functions

def get_notifications(db: Session, user_id: int, skip: int = 0, limit: int = 50):
    """Get notifications for a user with creator username"""
    notifications = db.query(models.Notification).filter(
        models.Notification.user_id == user_id
    ).order_by(models.Notification.created_at.desc()).offset(skip).limit(limit).all()
    
    # Add created_by_username to each notification
    result = []
    for notif in notifications:
        notif_dict = {
            "id": notif.id,
            "user_id": notif.user_id,
            "created_by_user_id": notif.created_by_user_id,
            "created_by_username": notif.created_by.username if notif.created_by else None,
            "title": notif.title,
            "message": notif.message,
            "type": notif.type,
            "read": notif.read,
            "link": notif.link,
            "created_at": notif.created_at
        }
        result.append(notif_dict)
    
    return result

def get_unread_notification_count(db: Session, user_id: int):
    """Count unread notifications for a user"""
    return db.query(models.Notification).filter(
        models.Notification.user_id == user_id,
        models.Notification.read == False
    ).count()

def mark_notification_as_read(db: Session, notification_id: int, user_id: int):
    """Mark a specific notification as read"""
    notification = db.query(models.Notification).filter(
        models.Notification.id == notification_id,
        models.Notification.user_id == user_id
    ).first()
    
    if notification:
        notification.read = True
        db.commit()
        db.refresh(notification)
    
    return notification

def mark_all_notifications_as_read(db: Session, user_id: int):
    """Mark all notifications for a user as read"""
    db.query(models.Notification).filter(
        models.Notification.user_id == user_id,
        models.Notification.read == False
    ).update({"read": True})
    db.commit()

def create_notification(db: Session, notification: schemas.NotificationCreate):
    """Create a new notification"""
    db_notification = models.Notification(**notification.dict())
    db.add(db_notification)
    db.commit()
    db.refresh(db_notification)
    return db_notification

def send_user_notification(db: Session, sender_id: int, data: schemas.NotificationSend):
    """Send a notification from one user to another"""
    # Validate recipient exists
    recipient = db.query(models.User).filter(models.User.id == data.recipient_user_id).first()
    if not recipient:
        return None
    
    # Build link if ticket_id provided
    link = None
    if data.ticket_id:
        ticket = db.query(models.Ticket).filter(models.Ticket.id == data.ticket_id).first()
        if ticket:
            link = f"/tickets/{data.ticket_id}"
    
    # Create notification
    db_notification = models.Notification(
        user_id=data.recipient_user_id,
        created_by_user_id=sender_id,
        title=data.title,
        message=data.message,
        type=data.type,
        link=link,
        read=False
    )
    
    db.add(db_notification)
    db.commit()
    db.refresh(db_notification)
    
    return db_notification

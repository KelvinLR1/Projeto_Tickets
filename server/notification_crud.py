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
    """Send a notification from one user to another (or multiple)"""
    
    target_user_ids = set()

    # 1. Add individual recipients
    if data.recipient_ids:
        target_user_ids.update(data.recipient_ids)
    
    # Backward compatibility
    if data.recipient_user_id:
        target_user_ids.add(data.recipient_user_id)

    # 2. Add recipients from sectors
    if data.sector_ids:
        # Get all users belonging to these sectors
        # Assuming User model has a relationship or we query via association table
        # If User has 'sectors' relationship:
        sector_users = db.query(models.User).join(models.User.sectors).filter(
            models.Sector.id.in_(data.sector_ids),
            models.User.is_active == True
        ).all()
        
        for user in sector_users:
            target_user_ids.add(user.id)

    if not target_user_ids:
        return None
    
    # Build link if ticket_id provided
    link = None
    if data.ticket_id:
        ticket = db.query(models.Ticket).filter(models.Ticket.id == data.ticket_id).first()
        if ticket:
            link = f"/tickets/{data.ticket_id}"

    notifications_created = []

    for user_id in target_user_ids:
        # Validate recipient exists
        recipient = db.query(models.User).filter(models.User.id == user_id).first()
        if not recipient:
            continue

        # Create notification
        db_notification = models.Notification(
            user_id=user_id,
            created_by_user_id=sender_id,
            title=data.title,
            message=data.message,
            type=data.type,
            link=link,
            read=False
        )
        db.add(db_notification)
        notifications_created.append(db_notification)
    
    db.commit()
    
    # Refresh all created (optional, might be slow for many)
    # for n in notifications_created:
    #     db.refresh(n)
    
    # Return the last one just to satisfy legacy single-return expectation if needed, 
    # or return a list if we change the endpoint.
    # For now, let's return the first one created so the API doesn't crash on "response_model=Notification"
    # Ideally we should change the response model to List[Notification] or a Summary.
    
    return notifications_created[0] if notifications_created else None

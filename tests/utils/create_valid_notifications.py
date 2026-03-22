from database import SessionLocal
from models import Notification, User, Ticket
from datetime import datetime

db = SessionLocal()

# Limpar notificações antigas de teste
db.query(Notification).delete()

# Buscar um ticket real do sistema
real_ticket = db.query(Ticket).first()

# Buscar todos os usuários
users = db.query(User).all()

# Criar notificações para cada usuário
for user in users:
    # Notificação 1: Com link para ticket real (se existir)
    if real_ticket:
        notif1 = Notification(
            user_id=user.id,
            title='Ticket Atribuído',
            message=f'O ticket #{real_ticket.id} "{real_ticket.title}" foi atribuído para você.',
            type='info',
            link=f'/tickets/{real_ticket.id}',
            read=False,
            created_at=datetime.now()
        )
        db.add(notif1)
    
    # Notificação 2: Sem link (apenas informativa)
    notif2 = Notification(
        user_id=user.id,
        title='Sistema Atualizado',
        message='O sistema de notificações foi atualizado com novo design e funcionalidades.',
        type='success',
        link=None,
        read=False,
        created_at=datetime.now()
    )
    db.add(notif2)
    
    # Notificação 3: Alerta sem link
    notif3 = Notification(
        user_id=user.id,
        title='Manutenção Programada',
        message='Haverá manutenção no servidor no próximo domingo às 02:00.',
        type='warning',
        link=None,
        read=False,
        created_at=datetime.now()
    )
    db.add(notif3)
    
    print(f'✅ 3 notificações criadas para {user.username} (ID: {user.id})')

db.commit()
print('\n✅ Todas as notificações foram criadas com sucesso!')
print(f'Total de tickets no sistema: {db.query(Ticket).count()}')
db.close()

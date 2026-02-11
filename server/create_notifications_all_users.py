from database import SessionLocal
from models import Notification, User
from datetime import datetime

db = SessionLocal()

# Buscar todos os usuários
users = db.query(User).all()

# Criar notificação para cada usuário
for user in users:
    notif = Notification(
        user_id=user.id,
        title='Ticket Atualizado',
        message=f'O ticket #123 "Configuração de rede" teve sua prioridade alterada para ALTA.',
        type='warning',
        link='/tickets/123',
        read=False,
        created_at=datetime.now()
    )
    db.add(notif)
    print(f'✅ Notificação criada para {user.username} (ID: {user.id})')

db.commit()
print('\n✅ Todas as notificações foram criadas com sucesso!')
db.close()

from database import SessionLocal
from models import Notification
from datetime import datetime

db = SessionLocal()

# Criar notificação não lida
notif = Notification(
    user_id=1,
    title='Novo Ticket Atribuído',
    message='O ticket #42 "Problema na impressora" foi atribuído para você pelo administrador.',
    type='info',
    link='/tickets/42',
    read=False,
    created_at=datetime.now()
)

db.add(notif)
db.commit()
print('✅ Notificação criada com sucesso!')
db.close()

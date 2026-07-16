import sqlite3
import os
import datetime

# Caminho do banco de dados SQLite do módulo de WhatsApp
db_path = r"c:\Code\Projeto_Tickets\whatsapp-chat\whatsapp_chat.db"

def seed():
    print(f"* Conectando ao banco de dados: {db_path}")
    
    # Criar diretório pai se não existir (apenas por segurança)
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Garantir que as tabelas necessárias existam
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tabela_atendentes (
          id TEXT PRIMARY KEY,
          nome TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tabela_atendimentos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cliente_jid TEXT UNIQUE,
          cliente_nome TEXT,
          cliente_avatar TEXT,
          atendente_id TEXT,
          status TEXT,
          started_at TEXT,
          FOREIGN KEY(atendente_id) REFERENCES tabela_atendentes(id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tabela_mensagens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cliente_jid TEXT,
          remetente TEXT,
          texto TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Limpar dados de teste anteriores para evitar duplicatas ou erros de UNIQUE
    cursor.execute("DELETE FROM tabela_mensagens")
    cursor.execute("DELETE FROM tabela_atendimentos")
    cursor.execute("DELETE FROM tabela_atendentes")

    # 1. Inserir atendentes (operadores) de teste
    operators = [
        ("admin", "Administrador"),
        ("kelvin", "Kelvin")
    ]
    for op_id, op_name in operators:
        cursor.execute("INSERT OR REPLACE INTO tabela_atendentes (id, nome) VALUES (?, ?)", (op_id, op_name))

    # 2. Inserir atendimentos de teste
    # JIDs são identificadores do WhatsApp (número + @c.us)
    now_str = datetime.datetime.now().isoformat()
    chats = [
        # Fila de espera
        ("5511988888888@c.us", "João Silva (Fila)", None, None, "fila", None),
        # Em atendimento (atribuídos ao admin)
        ("5511977777777@c.us", "Ana Costa (Sistema Lento)", None, "admin", "em_atendimento", now_str),
        ("5521966666666@c.us", "Carlos Santos (Financeiro)", None, "admin", "em_atendimento", now_str),
        # Finalizados
        ("5531955555555@c.us", "Mariana Lima (Reset Senha)", None, "admin", "finalizado", now_str)
    ]

    for jid, name, avatar, att_id, status, started in chats:
        cursor.execute("""
            INSERT INTO tabela_atendimentos (cliente_jid, cliente_nome, cliente_avatar, atendente_id, status, started_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (jid, name, avatar, att_id, status, started))

    # 3. Inserir histórico de mensagens de teste
    messages = [
        # João Silva (Fila)
        ("5511988888888@c.us", "cliente", "Olá, gostaria de saber o preço da consultoria de suporte.", "2026-07-16 02:00:00"),
        ("5511988888888@c.us", "cliente", "Estou no aguardo de um atendente.", "2026-07-16 02:01:00"),

        # Ana Costa (Em atendimento com admin)
        ("5511977777777@c.us", "cliente", "Oi, meu sistema está apresentando lentidão intermitente.", "2026-07-16 02:02:00"),
        ("5511977777777@c.us", "admin", "Olá Ana, sou o Administrador. Vou abrir o painel de monitoramento para verificar o uso de memória do servidor local.", "2026-07-16 02:03:00"),
        ("5511977777777@c.us", "cliente", "Muito obrigada! Fico no aguardo de instruções.", "2026-07-16 02:04:00"),

        # Carlos Santos (Em atendimento com admin)
        ("5521966666666@c.us", "cliente", "O boleto da mensalidade deste mês não chegou no meu e-mail.", "2026-07-16 02:05:00"),
        ("5521966666666@c.us", "admin", "Vou gerar a segunda via para você agora mesmo, Carlos.", "2026-07-16 02:06:00"),
        ("5521966666666@c.us", "cliente", "Pode me enviar por aqui em formato PDF ou o código de barras?", "2026-07-16 02:07:00"),
        ("5521966666666@c.us", "admin", "Sim, já estou gerando no financeiro e te envio em instantes.", "2026-07-16 02:08:00"),

        # Mariana Lima (Finalizado)
        ("5531955555555@c.us", "cliente", "Preciso resetar minha senha de acesso ao portal.", "2026-07-16 02:09:00"),
        ("5531955555555@c.us", "admin", "Sua senha provisória foi definida para: Mudar@123. Por favor altere no primeiro acesso.", "2026-07-16 02:10:00"),
        ("5531955555555@c.us", "cliente", "Deu certo, consegui acessar e já alterei! Obrigado!", "2026-07-16 02:11:00")
    ]

    for jid, sender, text, timestamp in messages:
        cursor.execute("""
            INSERT INTO tabela_mensagens (cliente_jid, remetente, texto, timestamp)
            VALUES (?, ?, ?, ?)
        """, (jid, sender, text, timestamp))

    conn.commit()
    conn.close()
    print("SUCCESS: Dados de teste do WhatsApp populados com sucesso!")

if __name__ == "__main__":
    seed()

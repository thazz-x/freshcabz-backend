CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(20) DEFAULT 'client', -- 'client', 'detailer', ou 'admin'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabela de Serviços (Os pacotes de lavagem)
CREATE TABLE services (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL, -- Preço base
    duration_minutes INT DEFAULT 60
);

-- 3. Tabela de Agendamentos (Bookings)
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    client_id INT REFERENCES users(id),   -- Quem pediu
    service_id INT REFERENCES services(id), -- Qual serviço
    detailer_id INT REFERENCES users(id),   -- Quem vai lavar (pode ser nulo no início)
    
    booking_date DATE NOT NULL,
    booking_time VARCHAR(10) NOT NULL,
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    car_size VARCHAR(20), -- 'Small', 'Medium', 'Large'
    final_price DECIMAL(10,2), -- Preço calculado final
    
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'confirmed', 'completed', 'cancelled'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabela de Notificações (Nova funcionalidade)
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    title VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =======================================================
-- DADOS INICIAIS (Essencial para o App não abrir vazio)
-- =======================================================

-- Inserir os 3 Serviços Padrão do FreshCabz
INSERT INTO services (name, description, price, duration_minutes) VALUES 
('Standard Wash', 'Exterior wash, dry, and tire shine.', 40.00, 45),
('Premium Detail', 'Interior & Exterior, wax, vacuum, and windows.', 75.00, 90),
('Deluxe Polish', 'Full detail plus clay bar, polish, and engine bay.', 120.00, 150);
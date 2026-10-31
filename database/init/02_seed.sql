-- Sample offerings. Delete or edit these from the dashboard.

INSERT INTO offerings (name, type, description, capacity, price, price_unit) VALUES
  ('Grand Hall + Rooms Package', 'event_place_with_rooms', 'Main event hall with 10 guest rooms for overnight stay.', 200, 150000, 'per event'),
  ('Garden Pavilion', 'event_place_only', 'Open-air pavilion for ceremonies and receptions.', 150, 80000, 'per event'),
  ('Deluxe Room', 'room_only', 'Air-conditioned room with queen bed.', 2, 4500, 'per night'),
  ('Family Room', 'room_only', 'Spacious room for families.', 5, 7500, 'per night'),
  ('Swimming Pool Access', 'amenity', 'Exclusive pool access during the booking.', NULL, 5000, 'per day'),
  ('Sound System & Lights', 'amenity', 'Professional audio and lighting setup.', NULL, 12000, 'per event'),
  ('Catering', 'amenity', 'Buffet catering service.', NULL, 650, 'per head');

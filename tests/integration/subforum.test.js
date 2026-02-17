const request = require('supertest');
const app = require('../../src/app');

describe('Subforum API Integration Test', () => {
  
  describe('GET /api/subforums', () => {
    it('should return 200 and all subforums list', async () => {
      const res = await request(app).get('/api/subforums');

      // Ekspektasi: Status sukses
      expect(res.statusCode).toEqual(200);
      
      // Ekspektasi: Format JSON bener (status: success, data: [])
      expect(res.body).toHaveProperty('status', 'success');
      expect(Array.isArray(res.body.data)).toBe(true);

      // Ekspektasi: Minimal ada 1 data (karena kita sudah seeding tadi)
      expect(res.body.data.length).toBeGreaterThan(0);

      // Ekspektasi: Struktur data di dalam array sudah benar
      const firstItem = res.body.data[0];
      expect(firstItem).toHaveProperty('id');
      expect(firstItem).toHaveProperty('name');
      expect(firstItem).toHaveProperty('slug');
    });
  });

});
const express = require('express');
const router = express.Router();
const tableController = require('../controllers/tableController');

// Define routes
router.get('/', tableController.getAllTables);
router.post('/', tableController.createTable);
router.put('/:id', tableController.updateTable);
router.patch('/:id/status', tableController.updateTableStatus);
router.delete('/:id', tableController.deleteTable);

module.exports = router;

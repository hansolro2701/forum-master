'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable('Posts', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      createdAt: Sequelize.DATE,
      updatedAt: Sequelize.DATE,
      
      content: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      postNumber: Sequelize.INTEGER,
      replyingToUsername: Sequelize.STRING,
      removed: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },

      UserId: Sequelize.INTEGER,
      ThreadId: Sequelize.INTEGER,
      replyId: Sequelize.INTEGER
    }, {
      charset: 'utf8mb4'
    })
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.dropTable('Posts');
  }
};

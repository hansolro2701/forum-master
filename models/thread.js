let urlSlug = require('url-slug')

module.exports = (sequelize, DataTypes) => {
	let Thread = sequelize.define('Thread', {
		name: {
			type: DataTypes.TEXT,
			set (val) {
				this.setDataValue('name', val)
				if(val) {
					this.setDataValue(
						'slug',
						//if you don't covert to lowercase it doesn't
						//correctly slugify diacritics, e.g. thrËad
						//becomes 'thr-ead' not 'thread'
						urlSlug(val.toString().toLowerCase() || '') || '_'
					)
				}
			},
			allowNull: false,
			validate: {
				notEmpty: {
					msg: 'The title cannot be empty'
				},
				len: {
					args: [4, 256],
					msg: 'The title must be between 4 and 256 characters'
				},
				isString (val) {
					if(typeof val !== 'string') {
						throw new sequelize.ValidationError('The title must be a string')
					}
				}
			}
		},
		slug: DataTypes.TEXT,
		postsCount: {
			type: DataTypes.INTEGER,
			defaultValue: 0
		},
		locked: {
			type: DataTypes.BOOLEAN,
			defaultValue: false
		}
	}, {
		instanceMethods: {
			getMeta (limit) {
				let meta = {}

				let posts = this.Posts
				let firstPost = posts[0]
				let lastPost = posts.slice(-1)[0]

				//next url
				if(!lastPost || lastPost.postNumber+1 === this.postsCount) {
					meta.nextURL = null
				} else {
					meta.nextURL =
						`/api/v1/thread/${this.id}?limit=${limit}&from=${lastPost.postNumber + 1}`
				}

				//previous url
				if(!firstPost || firstPost.postNumber === 0) {
					meta.previousURL = null
				} else if(firstPost.postNumber - limit < 0) {
					meta.previousURL =
						`/api/v1/thread/${this.id}?limit=${firstPost.postNumber}&from=0`
				} else {
					meta.previousURL =
						`/api/v1/thread/${this.id}?limit=${limit}&from=${firstPost.postNumber - limit}`
				}

				//remaining posts
				if(lastPost === undefined) {
					meta.nextPostsCount = 0
					meta.previousPostsCount = 0
					meta.postsRemaining = 0
				} else {
					let postsRemaining =
						this.postsCount - lastPost.postNumber - 1

					meta.postsRemaining = postsRemaining

					if(postsRemaining < limit) {
						meta.nextPostsCount = postsRemaining
					} else {
						meta.nextPostsCount = limit
					}

					if(firstPost.postNumber === 0) {
						meta.previousPostsCount = 0
					} else if(firstPost.postNumber - limit < 0) {
						meta.previousPostsCount = firstPost.postNumber
					} else {
						meta.previousPostsCount = limit
					}
				}

				return meta
			}
		},
		classMethods: {
			associate (models) {
				Thread.belongsTo(models.User)
				Thread.belongsTo(models.Category)
				Thread.belongsTo(models.PollQuestion)
				Thread.hasMany(models.Post, { foreignKeyConstraint: true, onDelete: 'CASCADE' })
			},
			includeOptions (from, limit) {
				let models = sequelize.models

				return [
					{ model: models.User, attributes: ['username', 'createdAt', 'color', 'picture', 'updatedAt', 'id'] }, 
					models.Category,
					{ 
						model: models.Post, 
						where: { postNumber: { $gte: from } },
						order: [['id', 'ASC']],
						limit,
						include: [
							{ model: models.Thread, attributes: ['slug'] }, 
							{ model: models.User, as: 'Likes', attributes: ['username', 'createdAt', 'id', 'color', 'picture'] },
							{ model: models.User, attributes: ['username', 'createdAt', 'id', 'color', 'picture', 'admin'] }, 
							{
								model: models.Post, as: 'Replies', include:
								[{ model: models.User, attributes: ['username', 'id', 'color', 'picture'] }]	
							}
						]
					}
				]
			}
		}
	})

	return Thread
}
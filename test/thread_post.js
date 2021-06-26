process.env.NODE_ENV = 'test'

let chai = require('chai')
let server = require('../server')
let should = chai.should()
let expect = chai.expect

let { sequelize, Thread } = require('../models')

const Errors = require('../lib/errors.js')
let PAGINATION_THREAD_ID

chai.use(require('chai-http'))
chai.use(require('chai-things'))

describe('Thread and post', () => {
	let userAgent, replyAgent

	//Wait for app to start before commencing
	before((done) => {
		if(server.locals.appStarted) mockData()

		server.on('appStarted', () => {
			mockData()
		})

		function mockData() {
			userAgent = chai.request.agent(server)
			replyAgent = chai.request.agent(server)

			userAgent
				.post('/api/v1/user')
				.set('content-type', 'application/json')
				.send({
					username: 'username',
					password: 'password',
					admin: true
				})
				.then(() => {
					userAgent
						.post('/api/v1/category')
						.set('content-type', 'application/json')
						.send({ name: 'category_name' })
						.then(() => { 
							return userAgent
								.post('/api/v1/category')
								.set('content-type', 'application/json')
								.send({ name: 'category with spaces' })
						})
						.then(() => { done() })
						.catch(done)
				})
				.catch(done)
		}

	})

	//Delete all rows in table after
	//tess completed
	after(() => {
		sequelize.sync({ force: true })
	})

	describe('POST /thread', () => {
		it('should create a thread if logged in', async () => {
			let res = await userAgent
				.post('/api/v1/thread')
				.set('content-type', 'application/json')
				.send({
					name: 'thread',
					category: 'CATEGORY_NAME'
				})

			res.should.have.status(200)
			res.should.be.json
			res.body.should.have.property('name', 'thread')
			res.body.should.have.property('postsCount', 0)
			res.body.should.have.property('slug', 'thread')
			res.body.should.have.deep.property('User.username', 'username')
			res.body.should.have.deep.property('Category.name', 'category_name')
		})
		it('should create a thread for a category with spaces in', async () => {
			let res = await userAgent
				.post('/api/v1/thread')
				.set('content-type', 'application/json')
				.send({
					name: 'thread123',
					category: 'CATEGORY_WITH_SPACES'
				})

			res.should.have.status(200)
			res.should.be.json
			res.body.should.have.property('name', 'thread123')
			res.body.should.have.property('postsCount', 0)
			res.body.should.have.property('slug', 'thread123')
			res.body.should.have.deep.property('User.username', 'username')
			res.body.should.have.deep.property('Category.name', 'category with spaces')
		})
		it('should give the slug _ if otherwise empty', async () => {
			let res = await userAgent
				.post('/api/v1/thread')
				.set('content-type', 'application/json')
				.send({
					name: ',,,,,,,,,,,,,,,,,',
					category: 'CATEGORY_WITH_SPACES'
				})

			res.should.have.status(200)
			res.should.be.json
			res.body.should.have.property('slug', '_')

			await Thread.destroy({ where: { name: '_' } })
		})
		it('should add a slug from the thread name', async () => {
			let res = await userAgent
				.post('/api/v1/thread')
				.set('content-type', 'application/json')
				.send({
					name: ' à long thrËad, with lØts of àccents!!!	',
					category: 'CATEGORY_NAME'
				})

			res.should.have.status(200)
			res.should.be.json
			res.body.should.have.property('name', ' à long thrËad, with lØts of àccents!!!	')
			res.body.should.have.property('slug', 'a-long-thread-with-lots-of-accents')
			res.body.should.have.deep.property('User.username', 'username')
			res.body.should.have.deep.property('Category.name', 'category_name')
		})
		it('should return an error if not logged in', async () => {
			try {
				let res = await chai.request(server)
					.post('/api/v1/thread')
					.set('content-type', 'application/json')
					.send({
						name: 'thread',
						category: 'CATEGORY_NAME'
					})

			} catch (res) {
				res.should.have.status(401)
				JSON.parse(res.response.text).errors.should.contain.something.that.deep.equals(Errors.requestNotAuthorized)
			}
		})
		it('should return an error if missing title', async () => {
			try {
				let res = await userAgent
					.post('/api/v1/thread')
					.send({
						category: 'CATEGORY_NAME'
					})

			} catch (res) {
				let body = JSON.parse(res.response.text)

				res.should.have.status(400)
				body.errors.should.contain.something.that.has.property('message', 'name cannot be null')
			}
		})
		it('should return an error if name has no length', done => {
			userAgent
					.post('/api/v1/thread')
					.set('content-type', 'application/json')
					.send({
						name: '',
						category: 'CATEGORY_NAME'
					})
					.end((err, res) => {
						res.should.be.json
						res.should.have.status(400)
						res.body.errors.should.contain.something.that.has.property('message', 'The title cannot be empty')

						done()
					})
		})
		it('should return an error if invalid types', async () => {
			try {
				let res = await userAgent
					.post('/api/v1/thread')
					.set('content-type', 'application/json')
					.send({
						name: 123,
						category: 'CATEGORY_NAME'
					})

			} catch (res) {
				let body = JSON.parse(res.response.text)

				res.should.have.status(400)
				body.errors.should.contain.something.that.has.property('message', 'The title must be a string')
			}
		})
		it('should return an error if category does not exist', async () => {
			try {
				let res = await userAgent
					.post('/api/v1/thread')
					.set('content-type', 'application/json')
					.send({
						name: 'thread1',
						category: 'non-existent'
					})

			} catch (res) {
				res.should.have.status(400)
				JSON.parse(res.response.text).errors.should.contain.something.that.deep.equals(Errors.invalidCategory)
			}
		})
	})

	describe('PUT /thread', () => {
		let threadId
		let normalUserAgent = chai.request.agent(server)

		before(done => {
			userAgent
				.post('/api/v1/thread')
				.set('content-type', 'application/json')
				.send({
					name: 'thread_lock',
					category: 'CATEGORY_NAME'
				})
				.then(res => {
					threadId = res.body.id

					return normalUserAgent
						.post('/api/v1/user')
						.set('content-type', 'application/json')
						.send({
							username: 'normaluseragent',
							password: 'password'
						})
				})
				.then(_ => {
					done()
				})
				.catch(done)
		})

		it('should lock the thread', async () => {
			let res = await userAgent
				.put('/api/v1/thread/' + threadId)
				.set('content-type', 'application/json')
				.send({
					locked: true
				})

			res.should.be.json
			res.should.have.status(200)
			res.body.should.have.property('success', true)

			let thread = await userAgent.get('/api/v1/thread/' + threadId)

			thread.body.should.have.property('locked', true)
		
		})
		it('should unlock the thread', async () => {
			let res = await userAgent
				.put('/api/v1/thread/' + threadId)
				.set('content-type', 'application/json')
				.send({
					locked: false
				})

			res.should.be.json
			res.should.have.status(200)
			res.body.should.have.property('success', true)

			let thread = await userAgent.get('/api/v1/thread/' + threadId)

			thread.body.should.have.property('locked', false)
		})
		it('should return an error if thread does not exist', done => {
			userAgent
				.put('/api/v1/thread/not_a_thread')
				.set('content-type', 'application/json')
				.send({
					locked: false
				})
				.end((err, res) => {
					res.should.be.json
					res.should.have.status(400)
					res.body.errors.should.include.something.that.deep.equals(Errors.invalidParameter('threadId', 'thread does not exist'))

					done()
				})
		})
		it('should return an error if not logged in', done => {
			chai.request(server)
				.put('/api/v1/thread/' + threadId)
				.set('content-type', 'application/json')
				.send({
					locked: false
				})
				.end((err, res) => {
					res.should.be.json
					res.should.have.status(401)
					res.body.errors.should.contain.something.that.deep.equals(Errors.requestNotAuthorized)

					done()
				})
		})
		it('should return an error if not an administrator', done => {
			normalUserAgent
				.put('/api/v1/thread/' + threadId)
				.set('content-type', 'application/json')
				.send({
					locked: false
				})
				.end((err, res) => {
					res.should.be.json
					res.should.have.status(401)
					res.body.errors.should.contain.something.that.deep.equals(Errors.requestNotAuthorized)

					done()
				})
		})
		it('should not allow new posts if locked', done => {
			userAgent
				.put('/api/v1/thread/' + threadId)
				.set('content-type', 'application/json')
				.send({
					locked: true
				})
				.end(_ => {
					userAgent
						.post('/api/v1/post')
						.set('content-type', 'application/json')
						.send({
							content: 'new post',
							threadId
						})
						.end((err, res) => {
							res.should.be.json
							res.should.have.status(400)
							res.body.errors.should.contain.something.that.deep.equals(Errors.threadLocked)

							done()
						})
				})
		})
	})

	describe('POST /post', () => {
		it('should create a post if logged in', async () => {
			let res = await userAgent
				.post('/api/v1/post')
				.set('content-type', 'application/json')
				.send({
					content: 'content **here**',
					threadId: 1
				})

			res.should.be.json
			res.should.have.status(200)
			res.body.should.have.property('content', '<p>content <strong>here</strong></p>\n')
			res.body.should.have.property('plainText', 'content here\n')
			res.body.should.have.property('postNumber', 0)
			res.body.should.have.deep.property('User.username', 'username')
			res.body.should.have.deep.property('Thread.name', 'thread')
			res.body.should.have.deep.property('Thread.postsCount', 1)

		})
		it('should return an error if not logged in', async () => {
			try {
				let res = await chai.request(server)
					.post('/api/v1/post')
					.set('content-type', 'application/json')
					.send({
						content: 'content',
						threadId: 1
					})

				res.should.be.json
				res.should.have.status(401)
				res.body.errors.should.contain.something.that.deep.equals(Errors.requestNotAuthorized)
			} catch (res) {
				res.should.have.status(401)
				JSON.parse(res.response.text).errors.should.contain.something.that.deep.equals(Errors.requestNotAuthorized)
			}
		})
		it('should return an error if missing content', done => {
				userAgent
					.post('/api/v1/post')
					.send({		
						threadId: 1
					})
					.end((err, res) => {
						res.should.be.json
						res.should.have.status(400)
						res.body.errors.should.contain.something.that.has.property('message', 'content must be a string')

						done()
					})
		})
		it('should return an error if missing threadId', done => {
			userAgent
				.post('/api/v1/post')
				.send({
					content: 'content'
				})
				.end((err, res) => {
					res.should.be.json
					res.should.have.status(400)
					res.body.errors.should.contain.something.that.has.property('message', 'thread does not exist')
					
					done()
				})
		})
		it('should return an error if thread id does not exist', done => {
			userAgent
				.post('/api/v1/post')
				.set('content-type', 'application/json')
				.send({
					content: 'content',
					threadId: 10
				})
				.end((err, res) => {
					res.should.be.json
					res.should.have.status(400)
					res.body.errors.should.contain.something.that.has.property('message', 'thread does not exist')
					done()
				})
		})
		it('should return an error if mentions are invalid type', done => {
			userAgent
				.post('/api/v1/post')
				.set('content-type', 'application/json')
				.send({
					content: 'content',
					threadId: 1,
					mentions: 'string'
				})
				.end((err, res) => {
					res.should.be.json
					res.should.have.status(400)
					res.body.errors.should.contain.something.that.has.property('message', 'mentions must be an array of strings')
					
					userAgent
						.post('/api/v1/post')
						.set('content-type', 'application/json')
						.send({
							content: 'content',
							threadId: 1,
							mentions: ['string', false, 3]
						})
						.end((err, res) => {
							res.should.be.json
							res.should.have.status(400)
							res.body.errors.should.contain.something.that.has.property('message', 'mentions must be an array of strings')
							done()
						})
				})
		})
		it('should be able to reply to a post', async () => {
			await replyAgent
				.post('/api/v1/user')
				.set('content-type', 'application/json')
				.send({
					username: 'username1',
					password: 'password'
				})

			let res = await replyAgent
				.post('/api/v1/post')
				.set('content-type', 'application/json')
				.send({
					content: 'another post',
					threadId: 1,
					replyingToId: 1
				})

			res.should.be.json
			res.should.have.status(200)
			res.body.should.have.property('postNumber', 1)
			res.body.should.have.property('content', '<p>another post</p>\n')
			res.body.should.have.property('plainText', 'another post\n')
			res.body.should.have.deep.property('User.username', 'username1')
			res.body.should.have.deep.property('Thread.name', 'thread')
			res.body.should.have.deep.property('Thread.postsCount', 2)
			res.body.should.have.property('replyingToUsername', 'username')
			res.body.should.have.property('Replies').that.deep.equals([])
		})
		it('should return any replies to a post', async () => {
			let res = await replyAgent.get('/api/v1/post/1')

			res.should.be.json
			res.should.have.status(200)
			res.body.should.have.deep.property('replyingToUsername', null)
			res.body.should.have.deep.property('Replies.0.content', '<p>another post</p>\n')
		})
		it('should return an error if reply id does not exist', async () => {
			try {
				let res = await replyAgent
					.post('/api/v1/post')
					.set('content-type', 'application/json')
					.send({
						content: 'yet another post',
						threadId: 1,
						replyingToId: 10
					})

				res.should.have.status(400)
				res.body.errors.should.contain.something.that.deep.equals(Errors.invalidParameter('replyingToId', 'post does not exist'))
			} catch (res) {
				let body = JSON.parse(res.response.text)

				res.should.have.status(400)
				body.errors.should.contain.something.that.deep.equals(Errors.invalidParameter('replyingToId', 'post does not exist'))
			}
		})
		it('should return an error if post reply not in same thread', async () => {
			try {
				let threadId = (await replyAgent
					.post('/api/v1/thread')
					.set('content-type', 'application/json')
					.send({
						name: 'another thread',
						category: 'CATEGORY_NAME'
					})).body.id

				let res = await replyAgent
					.post('/api/v1/post')
					.set('content-type', 'application/json')
					.send({
						content: 'yet another post',
						threadId: threadId,
						replyingToId: 1
					})

				res.should.have.status(400)
				res.body.errors.should.contain.something.that.deep.equals(Errors.invalidParameter('replyingToId', 'replies must be in same thread'))
			} catch (res) {
				let body = JSON.parse(res.response.text)

				res.should.have.status(400)
				body.errors.should.contain.something.that.deep.equals(Errors.invalidParameter('replyingToId', 'replies must be in same thread'))
			}
		})
	})

	describe('GET /thread/:id', () => {
		it('should return the thread and corresponding posts', async () => {
			let res = await chai.request(server).get('/api/v1/thread/1')

			res.should.have.status(200)
			res.should.be.json
			res.body.should.have.property('name', 'thread')
			res.body.should.have.deep.property('Category.name', 'category_name')
			res.body.should.have.deep.property('User.username', 'username')
			res.body.should.have.property('Posts')
			
			res.body.Posts.should.have.property('length', 2)

			res.body.Posts.should.contain.something.that.has.property('content', '<p>content</p>\n')
			res.body.Posts.should.contain.something.that.has.deep.property('User.username', 'username')
			
			res.body.Posts.should.contain.something.that.has.property('content', '<p>another post</p>\n')
			res.body.Posts.should.contain.something.that.has.deep.property('User.username', 'username1')
		})
		it('should allow pagination', async () => {
			let thread = await userAgent
				.post('/api/v1/thread')
				.set('content-type', 'application/json')
				.send({ category: 'CATEGORY_NAME', name: 'pagination' })

			let threadOther = await userAgent
				.post('/api/v1/thread')
				.set('content-type', 'application/json')
				.send({ category: 'CATEGORY_NAME', name: 'pagination_other' })

			PAGINATION_THREAD_ID = thread.body.id

			for(var i = 0; i < 30; i++) {
				let post = await userAgent
					.post('/api/v1/post')
					.set('content-type', 'application/json')
					.send({ threadId: thread.body.id, content: `POST ${i}` })

				if(i === 3) {
					await userAgent
						.post('/api/v1/post')
						.set('content-type', 'application/json')
						.send({ threadId: threadOther.body.id, content: `POST OTHER ${i}` })
				}
			}

			let pageOne = await userAgent.get('/api/v1/thread/' + thread.body.id)
			let pageTwo = await userAgent.get(pageOne.body.meta.nextURL)
			let pageThree = await userAgent.get(pageTwo.body.meta.nextURL)
			let pageInvalid = await userAgent.get('/api/v1/thread/' + thread.body.id + '?from=' + 100)

			pageOne.body.Posts.should.have.length(10)
			pageOne.body.meta.should.have.property('postsRemaining', 20)
			pageOne.body.meta.should.have.property('previousPostsCount', 0)
			pageOne.body.meta.should.have.property('nextPostsCount', 10)
			pageOne.body.Posts[0].should.have.property('content', '<p>POST 0</p>\n')

			pageTwo.body.Posts.should.have.length(10)
			pageTwo.body.meta.should.have.property('postsRemaining', 10)
			pageTwo.body.meta.should.have.property('previousPostsCount', 10)
			pageTwo.body.meta.should.have.property('nextPostsCount', 10)
			pageTwo.body.Posts[0].should.have.property('content', '<p>POST 10</p>\n')
			pageTwo.body.meta.should.have.property('previousURL')

			pageThree.body.Posts.should.have.length(10)
			pageThree.body.meta.should.have.property('postsRemaining', 0)
			pageThree.body.meta.should.have.property('previousPostsCount', 10)
			pageThree.body.meta.should.have.property('nextPostsCount', 0)
			pageThree.body.Posts[0].should.have.property('content', '<p>POST 20</p>\n')
			pageThree.body.Posts[9].should.have.property('content', '<p>POST 29</p>\n')
			expect(pageThree.body.meta.nextURL).to.be.null

			pageInvalid.body.Posts.should.have.length(0)
		})
		it('should allow you to get an individual and surrounding posts', async () => {
			let http = chai.request(server)
			
			let pageOne = await http.get(`/api/v1/thread/${PAGINATION_THREAD_ID}?postNumber=15`)

			let pageZero = await http.get(pageOne.body.meta.previousURL)
			let pageTwo = await http.get(pageOne.body.meta.nextURL)

			pageOne.body.Posts.should.have.length(10)
			pageOne.body.Posts[0].should.have.property('content', '<p>POST 11</p>\n')
			pageOne.body.Posts[4].should.have.property('content', '<p>POST 15</p>\n')
			pageOne.body.Posts[9].should.have.property('content', '<p>POST 20</p>\n')
			pageOne.body.meta.should.have.property('postsRemaining', 9)
			pageOne.body.meta.should.have.property('previousPostsCount', 10)
			pageOne.body.meta.should.have.property('nextPostsCount', 9)

			pageTwo.body.Posts.should.have.length(9)
			pageTwo.body.Posts[0].should.have.property('content', '<p>POST 21</p>\n')
			pageTwo.body.Posts[8].should.have.property('content', '<p>POST 29</p>\n')
			pageTwo.body.meta.should.have.property('nextURL', null)
			pageTwo.body.meta.should.have.property('postsRemaining', 0)
			pageTwo.body.meta.should.have.property('previousPostsCount', 10)
			pageTwo.body.meta.should.have.property('nextPostsCount', 0)
			
			pageZero.body.Posts.should.have.length(10)
			pageZero.body.Posts[0].should.have.property('content', '<p>POST 1</p>\n')
			pageZero.body.Posts[9].should.have.property('content', '<p>POST 10</p>\n')
			pageZero.body.meta.should.have.property('postsRemaining', 19)
			pageZero.body.meta.should.have.property('previousPostsCount', 1)
			pageZero.body.meta.should.have.property('nextPostsCount', 10)

			let pageFirst = await http.get(pageZero.body.meta.previousURL)
			pageFirst.body.Posts[0].should.have.property('content', '<p>POST 0</p>\n')
			pageFirst.body.meta.should.have.property('previousURL', null)
			pageFirst.body.meta.should.have.property('postsRemaining', 29)
			pageFirst.body.meta.should.have.property('previousPostsCount', 0)

		})
		it('should return an error if :id is invalid', async () => {
			try {
				let res = await chai.request(server).get('/api/v1/thread/invalid')

				res.should.have.status(400)
				res.body.errors.should.contain.something.that.deep.equals(Errors.invalidParameter('id', 'thread does not exist'))
			} catch (res) {
				let body = JSON.parse(res.response.text)

				res.should.have.status(400)
				body.errors.should.contain.something.that.deep.equals(Errors.invalidParameter('id', 'thread does not exist'))
			}
		})
	})

	describe('GET /post/:id', () => {
		it('should return the post', async () => {
			let res = await chai.request(server).get('/api/v1/post/1')

			res.should.have.status(200)
			res.should.be.json
			res.body.should.have.property('content', '<p>content <strong>here</strong></p>\n')
			res.body.should.have.deep.property('User.username', 'username')
			res.body.should.have.deep.property('Thread.name', 'thread')
			res.body.should.have.deep.property('Thread.Category.name', 'category_name')
			res.body.should.have.deep.property('Replies.0.User.username', 'username1')
		})
		it('should return an error if invalid post id', async () => {
			try {
				let res = await chai.request(server).get('/api/v1/post/invalid')

				res.should.have.status(400)
				res.body.errors.should.contain.something.that.has.property('message', 'post does not exist')
			} catch (res) {
				let body = JSON.parse(res.response.text)

				res.should.have.status(400)
				body.errors.should.contain.something.that.has.property('message', 'post does not exist')
			}
		})
	})

	describe('POST utf8', () => {
		it('should allow emojis', async () => {
			let res = await userAgent
				.post('/api/v1/post')
				.set('content-type', 'application/json')
				.send({
					content: '😂😀',
					threadId: 1
				})

			res.should.be.json
			res.should.have.status(200)
			res.body.should.have.property('content', '<p>😂😀</p>\n')
		})
	})

	describe('DELETE /post/:id', () => {
		let threadId
		let postId
		let normalUserAgent = chai.request.agent(server)

		before(done => {
			userAgent
				.post('/api/v1/thread')
				.set('content-type', 'application/json')
				.send({
					name: 'delete_post_thread',
					category: 'CATEGORY_NAME'
				})
				.then(res => {
					threadId = res.body.id

					return userAgent
						.post('/api/v1/post')
						.set('content-type', 'application/json')
						.send({
							content: 'test content here',
							threadId
						})
				})
				.then(res => {
					postId = res.body.id

					return normalUserAgent
						.post('/api/v1/user')
						.set('content-type', 'application/json')
						.send({
							username: 'delete_post_non_admin',
							password: 'password'
						})
				})
				.then(_ => {
					done()
				})
				.catch(done)
		})

		it('should remove the post', async () => {
			let res = await userAgent.delete('/api/v1/post/' + postId)

			res.should.be.json
			res.should.have.status(200)
			res.body.should.have.property('success', true)

			let post = await userAgent.get('/api/v1/post/' + postId)

			post.body.should.have.property('removed', true)
			post.body.should.have.property('content', '<p>[This post has been removed by an administrator]</p>\n')
		})
		it('should return an error if trying to reply to a removed post', async () => {
			replyAgent
				.post('/api/v1/post')
				.set('content-type', 'application/json')
				.send({
					content: 'reply to deleted post',
					replyId: postId,
					threadId
				})
				.end((err, res) => {
					res.should.be.json
					res.should.have.status(400)
					res.body.errors.should.include.something.that.deep.equals(Errors.postRemoved)
				})
		})
		it('should return an error if post does not exist', done => {
			userAgent
				.delete('/api/v1/post/not_a_post')
				.end((err, res) => {
					res.should.be.json
					res.should.have.status(400)
					res.body.errors.should.include.something.that.has.property('message', 'post does not exist')

					done()
				})
		})
		it('should return an error if not an admin', done => {
			normalUserAgent
				.delete('/api/v1/post/' + postId)
				.end((err, res) => {
					res.should.be.json
					res.should.have.status(401)
					res.body.errors.should.contain.something.that.deep.equals(Errors.requestNotAuthorized)

					done()
				})
		})
	})
})
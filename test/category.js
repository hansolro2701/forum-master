process.env.NODE_ENV = 'test'

let chai = require('chai')
let server = require('../server')
let should = chai.should()
let expect = chai.expect

let { sequelize, Thread, Category } = require('../models')

const Errors = require('../lib/errors.js')

chai.use(require('chai-http'))
chai.use(require('chai-things'))

describe('Category', () => {
	//Wait for app to start before commencing
	before((done) => {
		if(server.locals.appStarted) done()

		server.on('appStarted', () => {
			done()
		})
	})

	//Delete all rows in table after
	//tests completed
	after((done) => {
		sequelize.sync({ force: true })
			.then(() => {
				done(null);
			})
			.catch((err) => {
				done(err)
			})
	})

	describe('POST /category', () => {
		let agent = chai.request.agent(server)

		it('should add a new category if logged in', async () => {
			await agent
				.post('/api/v1/user')
				.set('content-type', 'application/json')
				.send({
					username: 'adminaccount',
					password: 'password',
					admin: true
				})

			let res = await agent
				.post('/api/v1/category')
				.set('content-type', 'application/json')
				.send({ name: 'category' })

			res.should.be.json
			res.should.have.status(200)
			res.body.should.have.property('name', 'category')
			res.body.should.have.property('color')
		})
		it('should have an "underscored" value field', async () => {
			let res = await agent
				.post('/api/v1/category')
				.set('content-type', 'application/json')
				.send({ name: ' 	another category here 	' })

			res.should.be.json
			res.should.have.status(200)
			res.body.should.have.property('name', ' 	another category here 	')
			res.body.should.have.property('value', 'ANOTHER_CATEGORY_HERE')
		})
		it('should return an error if category already exists', async () => {
			try {
				let res = await agent
					.post('/api/v1/category')
					.set('content-type', 'application/json')
					.send({ name: 'category' })

				res.should.be.json
				res.should.have.status(400)
				res.body.errors.should.contain.something.that.deep.equals(Errors.categoryAlreadyExists)
			} catch (res) {
				res.should.have.status(400)
				res.response.body.errors.should.contain.something.that.deep.equals(Errors.categoryAlreadyExists)
			}
		})
		it('should return an error if missing category parameter', done => {
			agent
				.post('/api/v1/category')
				.set('content-type', 'application/json')
				.send({})
				.end((err, res) => {
					res.should.be.json
					res.should.have.status(400)
					res.body.errors.should.contain.something.that.has.property('message', 'name cannot be null')

					done()
				})
		})
		it('should return an error if category parameter has no length', done => {
			agent
				.post('/api/v1/category')
				.set('content-type', 'application/json')
				.send({ name: '' })
				.end((err, res) => {
					res.should.be.json
					res.should.have.status(400)
					res.body.errors.should.contain.something.that.has.property('message', 'The category name can\'t be empty')

					done()
				})
		})
		it('should return an error if not an admin account', async () => {
			let agent = chai.request.agent(server)

			await agent
				.post('/api/v1/user')
				.set('content-type', 'application/json')
				.send({
					username: 'username',
					password: 'password',
				})

			try {
				let res = await agent
					.post('/api/v1/category')
					.set('content-type', 'application/json')
					.send({ name: 'category1' })

				res.should.be.json
				res.should.have.status(401)
				res.body.errors.should.contain.something.that.deep.equals(Errors.requestNotAuthorized)
			} catch (res) {
				res.should.have.status(401)
				JSON.parse(res.response.text).errors.should.contain.something.that.deep.equals(Errors.requestNotAuthorized)
			}
		})
		it('should return an error if not logged', async () => {
			try {
				await chai.request(server)
					.post('/api/v1/category')
					.set('content-type', 'application/json')
					.send({ name: 'category1' })

				res.should.be.json
				res.should.have.status(401)
				res.body.errors.should.contain.something.that.deep.equals(Errors.requestNotAuthorized)
			} catch (res) {
				res.should.have.status(401)
				JSON.parse(res.response.text).errors.should.contain.something.that.deep.equals(Errors.requestNotAuthorized)
			}
		})
	})

	describe('GET /category', () => {
		before(async () => {
			let agent = chai.request.agent(server)

			await agent
				.post('/api/v1/user/adminaccount/login')
				.set('content-type', 'application/json')
				.send({ password: 'password' })

			await agent
				.post('/api/v1/category')
				.set('content-type', 'application/json')
				.send({ name: 'another_category' })

			await agent
				.post('/api/v1/category')
				.set('content-type', 'application/json')
				.send({ name: 'category with spaces' })
		})

		it('should return all categories', async () => {
			let res = await chai.request(server)
				.get('/api/v1/category')

			res.should.be.json
			res.should.have.status(200)
			res.body.should.contain.an.item.with.property('name', 'category')
			res.body.should.contain.an.item.with.property('name', 'another_category')
			res.body.should.contain.an.item.with.property('name', 'category with spaces')
		})
	})

	describe('GET /category/:category', () => {

		it('should return allow pagination for category ALL', async () => {
			let agent = chai.request.agent(server)
			
			await agent
				.post('/api/v1/user/adminaccount/login')
				.set('content-type', 'application/json')
				.send({ password: 'password' })

		 	await agent
		 		.post('/api/v1/category')
				.set('content-type', 'application/json')
				.send({ name: 'pagination1' })

			await agent
		 		.post('/api/v1/category')
				.set('content-type', 'application/json')
				.send({ name: 'pagination2' })

			for(var i = 0; i < 30; i++) {
				let category = 'pagination1'

				if(i % 2) category = 'pagination2'

				let thread = await agent
					.post('/api/v1/thread')
					.set('content-type', 'application/json')
					.send({ name: `THREAD ${i}`, category })

				await agent
					.post('/api/v1/post')
					.set('content-type', 'application/json')
					.send({ content: `POST ${i}`, threadId: thread.body.id })
			}

			let pageOne = await agent.get('/api/v1/category/ALL')
			let pageTwo = await agent.get(pageOne.body.meta.nextURL)
			let pageThree = await agent.get(pageTwo.body.meta.nextURL)

			pageOne.body.Threads.should.have.length(10)
			pageOne.body.meta.should.have.property('nextThreadsCount', 10)
			pageOne.body.Threads[0].Posts[0].should.have.property('content', '<p>POST 29</p>\n')

			pageTwo.body.Threads.should.have.length(10)
			pageTwo.body.meta.should.have.property('nextThreadsCount', 10)
			pageTwo.body.Threads[0].Posts[0].should.have.property('content', '<p>POST 19</p>\n')

			pageThree.body.Threads.should.have.length(10)
			pageThree.body.meta.should.have.property('nextThreadsCount', 0)
			pageThree.body.Threads[0].Posts[0].should.have.property('content', '<p>POST 9</p>\n')
			pageThree.body.Threads[9].Posts[0].should.have.property('content', '<p>POST 0</p>\n')
			expect(pageThree.body.meta.nextURL).to.be.null


		})

		it('should return all threads in a category', async () => {
			let agent = chai.request.agent(server)

			await agent
				.post('/api/v1/user/adminaccount/login')
				.set('content-type', 'application/json')
				.send({ password: 'password' })


			for(var i = 0; i < 3; i++) {
				let thread = await agent
					.post('/api/v1/thread')
					.set('content-type', 'application/json')
					.send({ name: 'thread ' + i, category: 'category' })

				await agent
					.post('/api/v1/post')
					.set('content-type', 'application/json')
					.send({ content: 'content here ' + i, threadId: thread.body.id })
			}


			let res = await chai.request(server)
				.get('/api/v1/category/CATEGORY')

			res.should.be.json
			res.should.have.status(200)
			res.body.should.have.property('name', 'category')
			res.body.Threads.should.have.property('length', 3)
			res.body.Threads.should.contain.an.item.with.deep.property('User.username', 'adminaccount')
			res.body.Threads[0].Posts[0].should.have.property('content', '<p>content here 2</p>\n')
			res.body.Threads[1].Posts[0].should.have.property('content', '<p>content here 1</p>\n')
			res.body.Threads[2].Posts[0].should.have.property('content', '<p>content here 0</p>\n')
			res.body.Threads.should.contain.an.item.with.deep.property('Posts.0.User.username', 'adminaccount')

		})

		it('should return all threads in a category with spaces', async () => {
			let agent = chai.request.agent(server)

			await agent
				.post('/api/v1/user/adminaccount/login')
				.set('content-type', 'application/json')
				.send({ password: 'password' })

			let thread = await agent
					.post('/api/v1/thread')
					.set('content-type', 'application/json')
					.send({ name: 'thread', category: 'CATEGORY_WITH_SPACES' })

				await agent
					.post('/api/v1/post')
					.set('content-type', 'application/json')
					.send({ content: 'content here', threadId: thread.body.id })

			let res = await chai.request(server)
				.get('/api/v1/category/CATEGORY_WITH_SPACES')

			res.should.be.json
			res.should.have.status(200)
			res.body.should.have.property('name', 'category with spaces')
			res.body.Threads.should.have.property('length', 1)
			res.body.Threads.should.contain.an.item.with.deep.property('User.username', 'adminaccount')
			res.body.Threads[0].Posts[0].should.have.property('content', '<p>content here</p>\n')
			res.body.Threads.should.contain.an.item.with.deep.property('Posts.0.User.username', 'adminaccount')
		})


		it('should return an error if category does not exist', async () => {
			try {
				let res = await chai.request(server)
					.get('/api/v1/category/not_real')

				res.should.be.json
				res.should.have.status(400)
				res.body.errors.should.contain.something.that.deep.equals(Errors.invalidParameter('id', 'category does not exist'))
			} catch (res) {
				let body = JSON.parse(res.response.text)
				res.should.have.status(400)
				body.errors.should.contain.something.that.deep.equals(Errors.invalidParameter('id', 'category does not exist'))
			}
		})
	})

	describe('PUT /category/:category_id', () => {
		let admin = chai.request.agent(server)

		before(done => {
			 admin
			 	.post('/api/v1/user/adminaccount/login')
				.set('content-type', 'application/json')
				.send({ password: 'password' })
				.end((err, res) => {
					done()
				})
		})

		it('should update a category', async () => {
			let res = await admin
				.put('/api/v1/category/1')
				.set('content-type', 'application/json')
				.send({
					name: 'new category name',
					color: '#8ae6f2'
				})

			res.should.have.status(200)
			res.should.be.json
			res.body.should.have.property('name', 'new category name')
			res.body.should.have.property('color', '#8ae6f2')

			let categoryUpdated = await Category.findById(1)
			categoryUpdated.should.have.property('name', 'new category name')
			categoryUpdated.should.have.property('color', '#8ae6f2')

		})
		it('should update a category with only one param', async () => {
			let res = await admin
				.put('/api/v1/category/1')
				.set('content-type', 'application/json')
				.send({
					name: 'new category name2',
				})

			let categoryUpdated = await Category.findById(1)
			categoryUpdated.should.have.property('name', 'new category name2')
			categoryUpdated.should.have.property('color', '#8ae6f2')

		})
		it('should return an error if not admin', done => {
			chai.request(server)
				.put('/api/v1/category/1')
				.set('content-type', 'application/json')
				.send({
					name: 'new name here again',
					color: '#fffff'
				})
				.end((err, res) => {
					res.should.be.json
					res.should.have.status(401)
					res.body.errors.should.contain.something.that.deep.equals(Errors.requestNotAuthorized)

					done()
				})
		})
		it('should return an error if not valid id', done => {
			admin
				.put('/api/v1/category/notavalidid')
				.set('content-type', 'application/json')
				.send({
					name: 'new category name',
					color: '#8ae6f2'
				})
				.end((err, res) => {
					res.should.be.json
					res.should.have.status(400)
					res.body.errors.should.contain.something.with.property('message', 'category id is not valid')

					done()
				})
		})
		it('should return an error if invalid types', done => {
			admin
				.put('/api/v1/category/2')
				.set('content-type', 'application/json')
				.send({
					name: 123,
					color: 456
				})
				.end((err, res) => {
					res.should.be.json
					res.should.have.status(400)
					res.body.errors.should.contain.something.with.property('message', 'The color must be a string')
					res.body.errors.should.contain.something.with.property('message', 'The category name must be a string')
				
					done()
				})
		})
	})

	describe('DELETE /category/:category_id', () => {
		let admin = chai.request.agent(server)
		let categoryId, thread1Id, thread2Id

		before(done => {
			admin
			 	.post('/api/v1/user/adminaccount/login')
				.set('content-type', 'application/json')
				.send({ password: 'password' })
				.then(res => {
					return admin
						.post('/api/v1/category')
						.set('content-type', 'application/json')
						.send({ name: 'category_to_delete' })
				})
				.then(res => {
					categoryId = res.body.id
					
					return admin
						.post('/api/v1/thread')
						.set('content-type', 'application/json')
						.send({ name: 'thread1', category: 'category_to_delete' })
				})
				.then(res => {
					thread1Id = res.body.id
					
					return admin
						.post('/api/v1/thread')
						.set('content-type', 'application/json')
						.send({ name: 'thread2', category: 'category_to_delete' })
				})
				.then(res => {
					thread2Id = res.body.id
					done()
				})
				.catch(e => {
					console.log(e)
					done(e)
				})
		})

		it('should delete a category and place all threads in that category into "Other"', async () => {
			let res = await admin.delete('/api/v1/category/' + categoryId)
			res.should.be.json
			res.should.have.status(200)

			let category = await Category.findById(categoryId)
			expect(category).to.be.null

			let thread1 = await Thread.findById(thread1Id, {
				include: [Category]
			})
			let thread2 = await Thread.findById(thread2Id, {
				include: [Category]
			})

			thread1.Category.should.have.property('name', 'Other')
			thread2.Category.should.have.property('name', 'Other')
		})
		it('should return an error if not an admin', done => {
			chai.request(server)
				.delete('/api/v1/category/1')
				.end((err, res) => {
					res.should.be.json
					res.should.have.status(401)
					res.body.errors.should.contain.something.that.deep.equals(Errors.requestNotAuthorized)

					done()
				})
		})
		it('should return an error if invalid id', done => {
			admin
				.delete('/api/v1/category/notavalidid')
				.end((err, res) => {
					res.should.be.json
					res.should.have.status(400)
					res.body.errors.should.contain.something.with.property('message', 'category id does not exist')

					done()
				})
		})
	})
})
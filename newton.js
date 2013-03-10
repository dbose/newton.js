	/*
    A wrapper around Box2D for SVG. Inspired by http://www.youtube.com/watch?v=bJ_ONON90fo

    NOTE:
        I may need a custom renderer through world.SetDebugDraw(...)
*/
;(function($, Raphael, Box2D) {

    // http://paulirish.com/2011/requestanimationframe-for-smart-animating/
    window.requestAnimFrame = (function(){
        return  window.requestAnimationFrame       ||
              window.webkitRequestAnimationFrame ||
              window.mozRequestAnimationFrame    ||
              window.oRequestAnimationFrame      ||
              window.msRequestAnimationFrame     ||
              function(/* function */ callback, /* DOMElement */ element){
                window.setTimeout(callback, 1000 / 60);
              };
    })();

	/* World */
    Mixow.Game = Mixow.Game || {};

    Mixow.Game.SCALE = 20;
    Mixow.Game.GRAVITY = 9.8;


    Mixow.Game.Math = {

        calculateWinding : function(vertices, vertexCount) {

            if (vertices.length != vertexCount) {
                return -1;
            }

            var k, area;
            for (var i = 0; i < vertexCount; ++i){
                k = (i + 1) % vertexCount;
                area += (vertices[k].x * vertices[i].y) - (vertices[i].x * vertices[k].y);
            }

            return area;
        },

        /*
            Computes vertices and centroid of a Raphael shape
        */
        computeVerticesAndCentroid : function(shape, scale) {

            var b2Vec2 = Box2D.Common.Math.b2Vec2,
                b2PolygonShape = Box2D.Collision.Shapes.b2PolygonShape;


            // Need to remove the path-closure ("Z"), if exists !
            var pathArray = shape.attr("path");
            if (pathArray[pathArray.length - 1][0] == "Z") {
                pathArray.pop();
            }

            // Convert to vectors and scale to world
            var vertices = $.map(pathArray, function(item, i) {
                return new b2Vec2(item[1] / scale, item[2] / scale);
            });

            // Need to draw vertices in a CCW fashion !. That's why check winding
            var winding = this.calculateWinding(vertices, vertices.length);
            if (winding > 0) {
                vertices.reverse();
            }

            // Note:
            //		http://stackoverflow.com/a/6639781

            // Need to draw the vertices in relative to the centroid

            // Compoute the centroid
            return {
                vertices: vertices,
                centroid: b2PolygonShape.ComputeCentroid(vertices, vertices.length)
            };
        }

    };

	/*
		Wraps Box2D's b2Body
	*/
	Mixow.Game.Body = function(body, shape, context) {
		var self = this,
			_scale = Mixow.Game.SCALE,
			_body = body,
            _context = context,
            _shape = shape,
            _world = context.physics.world,
            _physicsWorld = _world.getWorld(),
            _gravity = Mixow.Game.GRAVITY,
            _viewPort = context.viewPort,
            _destroy = "destroy";

        var _mouseJoint = null;

		var	b2Vec2 = Box2D.Common.Math.b2Vec2,
            b2MouseJointDef = Box2D.Dynamics.Joints.b2MouseJointDef,
            cos = Math.cos,
            sin = Math.sin,
            PI = Math.PI;

        // Check collision rules
        if (_context && _context.behaviors && _context.behaviors.collision) {
            self.rules = _context.behaviors.collision
        }

		/*
			Give an impulse to the body. 
		*/
		self.impulse = function(rad, power) {
						
			_body.SetAwake(true);			
			_body.ApplyImpulse(new b2Vec2(cos(rad) * power, sin(rad) * power),
							_body.GetWorldCenter());
		};
		
		self.force = function(rad, power) {
			_body.SetAwake(true);			
			_body.ApplyForce(new b2Vec2(cos(rad) * power, sin(rad) * power),
							_body.GetWorldCenter());
		};

		self.impartVelocity = function(rad, velocity) {
			_body.SetAwake(true);			
			_body.SetLinearVelocity(new b2Vec2(cos(rad) * velocity, sin(rad) * velocity));
		};
		
		self.getShape = function() {
			return _shape;
		};

        self.getMaterial = function() {
            if (_context && _context.material) {
                return _context.material;
            }
            return null;
        };
		
		self.makeHero = function() {
			//This is what stops the player from rotating
			_body.m_sweep.a = 0;						
		};
		
		self.getPosition = function() {
			var box2DPos = _body.GetWorldCenter();
			return new b2Vec2(box2DPos.x * _scale, box2DPos.y * _scale);
		};

        self.onMouseDown = function(e) {
            // Behaviors
            if (_shape && _context && _context.behaviors && _context.behaviors.click) {
                if (_context.behaviors.click == 'click-throw') {

                    // Install a mouse joint for 'click-throw' behavior
                    var mouse_joint = new b2MouseJointDef;
                    mouse_joint.bodyA = _physicsWorld.GetGroundBody();
                    mouse_joint.bodyB = _body;
                    mouse_joint.target.Set(e.offsetX / _scale, e.offsetY / _scale);
                    mouse_joint.maxForce = 100 * _body.GetMass();
                    //mouse_joint.timeStep = step;

                    _mouseJoint = _physicsWorld.CreateJoint(mouse_joint);
                    return _mouseJoint;
                }
                else if (_context.behaviors.click == 'click-destroy') {
                    // Note:
                    //		Let's don't destroy this right now. Instead we mark as "destroy" and then
                    //		destroy this in the game loop
                    _shape.markAsDelete = true;
                }
            }
        };

        self.onMouseMove = function(e) {
            if (_mouseJoint) {
                _mouseJoint.SetTarget(new b2Vec2(e.offsetX / _scale, e.offsetY / _scale));
            }
        };

        self.onMouseUp = function(e) {
            if (_mouseJoint) {
                _physicsWorld.DestroyJoint(_mouseJoint);
                _mouseJoint = null;
            }
        };

        self.destroy = function() {
            _physicsWorld.DestroyBody(_body);
            _shape.remove();
        };

        self.update = function() {

            // Check for markAsDelete flag and destroy accordingly
            if ((typeof(_shape.markAsDelete) != undefined) && (_shape.markAsDelete)) {

                this.destroy();
            }
            else {

                // Handle bubble behavior
                if (_context && _context.behaviors && _context.behaviors.bubble) {
                    _body.ApplyForce(new b2Vec2(0, -_gravity), _body.GetWorldCenter());
                }

                var pos = _body.GetPosition(),
                    angle = _body.GetAngle();

                // Update shape
                if ((_shape.type == "circle") || ((_shape.type == "ellipse"))) {
                    _shape.attr({
                        "cx": pos.x * _scale - _viewPort.x,
                        "cy": pos.y * _scale,
                        "rotation": angle * 180 / PI
                    });
                }
                else if ((_shape.type == "rect") || (_shape.type == "image")) {
                    _shape.attr({
                        "x": (pos.x * _scale) - (_shape.attr("width") / 2) - _viewPort.x,
                        "y": (pos.y * _scale) - (_shape.attr("height") / 2),
                        "rotation": angle * 180 / PI
                    });
                }
                else if (_shape.type == "path") {
                    if (typeof(_shape.subtype) !== "undefined") {
                        var subtype = _shape.subtype;
                        switch(subtype) {
                            case "line":
                                var path = _shape.attr("path"),
                                    centerX = (path[0][1] + path[1][1]) / 2,
                                    centerY = (path[0][2] + path[1][2]) / 2;

                                    _shape.translate(pos.x * _scale - centerX,
                                                    pos.y * _scale - centerY);
                                break;
                        }
                    }
                    else {
                        var computedResult = Mixow.Game.Math.computeVerticesAndCentroid(_shape, _scale);
                        var centroid = computedResult.centroid;
                        _shape.translate(pos.x * _scale - centroid.x * _scale,
                                        pos.y * _scale - centroid.y * _scale);
						_shape.rotate(angle * 180 / PI);
                    }

                }
            }
        }

        self.onContact = function(otherBody, impulse) {

            var other_material = otherBody.getMaterial(),
                shape = _shape;
            if (other_material == null) {
                return;
            }

            // FIXME:
            //      Loop in a sensitive path. Ideally we should copy necessary data, queue things up and yield
            //      control.
            $.each(self.rules, function(index, rule) {

                // Make sure material matches
                if (rule.target == other_material) {

                    if (rule.action == _destroy) {
                        shape.markAsDelete = true;
                    }
                }
            });

            return;
        };
	};
	
	/*
		A Viewport / Camera class
	*/
	Mixow.Game.ViewPort = function(set, width, height) {
	
		var self = this;
		
		
		// Store the entire set
		self.set = set;
		
		self.x = 0;
		
		// Store width and height
		self.width = width;					
		self.height = height;
		
		/*
			Will move the viewport to the position given on the specified axis
		*/
		self.scroll = function(axis, v) {
			if (self.set) {
				(axis == "_x") ? self.set.translate(v, 0) : self.set.translate(0, v);				
			}			
		};

	};
	
    Mixow.Game.World = function(paper) {

        var self = this;

		/*
			This stores a hash of bodies added to the world
		*/
		var bodies = {};
		
        /*
            Reference to Raphael paper, this world is built upon
        */
        self.draw = paper;

        var canvas = self.draw.canvas,
            canvasElement = $(canvas),
			documentElement = $(document),
			containerElement = canvasElement.parent().parent(),
            //canvasWidth = $(canvas).css("width"),
            //canvasHeight = $(canvas).css("height");
            canvasWidth = canvasElement.width(),
            canvasHeight = canvasElement.height();

        var b2Vec2 = Box2D.Common.Math.b2Vec2,
			b2Math = Box2D.Common.Math.b2Math,
            b2BodyDef = Box2D.Dynamics.b2BodyDef,
            b2Body = Box2D.Dynamics.b2Body,
            b2FixtureDef = Box2D.Dynamics.b2FixtureDef,
            b2Fixture = Box2D.Dynamics.b2Fixture,
            b2World = Box2D.Dynamics.b2World,
            b2MassData = Box2D.Collision.Shapes.b2MassData,
            b2PolygonShape = Box2D.Collision.Shapes.b2PolygonShape,
            b2CircleShape = Box2D.Collision.Shapes.b2CircleShape,
            b2DebugDraw = Box2D.Dynamics.b2DebugDraw,
			b2FilterData = Box2D.Dynamics.b2FilterData,
			b2EdgeShape = Box2D.Collision.Shapes.b2EdgeShape,
            b2MouseJoint = Box2D.Dynamics.Joints.b2MouseJoint,
			b2MouseJointDef = Box2D.Dynamics.Joints.b2MouseJointDef,
			b2ContactListener = Box2D.Dynamics.b2ContactListener,
			PI = Math.PI;

		var stopped = false;

        /*
            Remember from our previous Box2D Orientation that Box2D likes to operate on objects
            between 0.1 meters and 10 meters. You should not use pixels as your units, otherwise
            Box2D would be trying to simulate dust particles or cruise ships. You will often see
            Box2D code specify a scale factor, usually around 30.
        */
        var SCALE = Mixow.Game.SCALE;

		/*
			Set gravity as real world. Platform games need ti change this for better game play
		*/
		var gravity = Mixow.Game.GRAVITY;

        var world = new b2World(
            new b2Vec2(0, gravity),    //gravity
            true                 //allow sleep
        );

        /*
            Box2D recommends keeping the time step constant. For example, don't tie the simulation time step to the
            frame rate, as frame rate can really vary during a game. The Box2D manual will suggest a 60Hz time step,
            which is 1/60 seconds.
        */
        var step = 1.0/60.0;

        /*
            The velocity phase "computes the impulses necessary for the bodies to move correctly."
            Box2D will suggest a velocity iteration count of 8, but you can change this depending on your needs.
            It's a trade-off between performance and accuracy.
         */
        var velocityIterations = 8;

        /*
            The position phase "adjusts the positions of the bodies ro reduce overlap and joint detachment."
            The recommended value is 3, though you can change this with the same performance and accuracy trade-offs.
            The position phase might exist early if the solver determines the errors are small enough
         */
        var positionIterations = 3;

        /*
            A Fixture Definition defines the attributes of the object, such as density, friction, and restitution
            (bounciness).
        */
		var fixtureCreator = function() {
			var fixDef = new b2FixtureDef;
            fixDef.density = 1.0;
            fixDef.friction = 0.5;
            fixDef.restitution = 0.3;
            return fixDef;
		}
        var fixtureDef = (function() {
            return fixtureCreator();
        })();

		/*
            A Body Definition defines where in the world the object is, and if it is dynamic (reacts to things) or
            static. A Body Definition's position is set to the middle center-point of the object.
        */
        var bodyDef = new b2BodyDef;

		/*
			Forms a mouse joint through Box2D
		*/
		var mouseJoint = null;

		/*
			Background for the world. Can be mutated
		*/
		var backgroundImage = null;
		
		
		/*
			A Raphael set containing all elements
		*/
		var bodySet = paper.set();
		var viewPort = new Mixow.Game.ViewPort(bodySet, containerElement.width(), containerElement.height());
		
		
		/*
			Represents main actor in a FPS / Platformer
		*/
		var fpsActor = null;
        var fpsKeyHandling = null;
        var keyFlags = {up: false, left: false, right: false};

		var toRadian = function(deg) {
			return (PI/180) * deg;
		};
		
		var toDeg = function(rad) {
			return (180/PI) * rad;
		};
		
		/*
			A custom Box2D renderer for Raphael 
		*/
		var RaphaelDraw = function(paper) {
			var self = this,
				draw = paper;

			self.m_lineThickness = 1.0;
			
            /*
				Throwing error in DrawDebugData(...). b2DebugDraw assumes a "canvas"-specific implementation 
            */
			self.m_sprite = {
                graphics: {
                    clear: function () {
						//draw.clear();
                    }
                }
            };

			self.SetLineThickness = function (lineThickness) {
				if (lineThickness === undefined) 
					lineThickness = 0;
				
				self.m_lineThickness = lineThickness;				
			};
			
			self.DrawPolygon = function (vertices, vertexCount, color){		
				//console.log("Drawing polygon..." + vertices);		
			};
			
			self.DrawSolidPolygon = function (vertices, vertexCount, color, userData) {				
				
				/*
					Need to scale the data received from Box2D (Physics) for proper rendering in Raphael
				*/
				
				/*
				var pathString = $.map(vertices, function(el, i) {
									return el.x * SCALE + "," + el.y * SCALE
								}).join(" ");
				var shape = draw.polygon(pathString).attr({
					"stroke": userData.attr("stroke"),
		            "fill": userData.attr("fill"),
					"stroke-width": userData.attr("stroke-width"),
					"fill-opacity": userData.attr("fill-opacity"),
					"stroke-opacity": userData.attr("stroke-opacity")
				});
				shape.id = userData.id;		
				*/		
				
				/*
				var var body_data = bodies[userData.id],
					body = body_data.body,
					t_delta = body_data.t_delta,
					a_delta = body_data.a_delta,
					immovable = body_data.immovable;
					
				
					// Obtain simulated position and angle of the body representing the shape in the world
					var currentPos = b2PolygonShape.ComputeCentroid(vertices, vertexCount);

					userData.translate((currentPos.x - t_delta.x) * SCALE, (currentPos.y - t_delta.y) * SCALE);
					
					// Update delta	
					body_data.t_delta = currentPos;

					// Update shape
					

					userData.rotate(toDeg(body.GetAngle()));
				*/
				
			};
			
			self.DrawCircle = function (center, radius, color) {	
				console.log("Drawing circle..." + "c=" + center + ",r=" + radius);
			};
			
			self.DrawSolidCircle = function (center, radius, axis, color, userData) {
				
				/*
					Need to scale the data received from Box2D (Physics) for proper rendering in Raphael
				*/
				
				// NEED THis
				
				/*
				var shape = draw.circle(center.x * SCALE,
								center.y * SCALE, 
								radius * SCALE).attr({
									"stroke": userData.attr("stroke"),
						            "fill": userData.attr("fill"),
									"stroke-width": userData.attr("stroke-width"),
									"fill-opacity": userData.attr("fill-opacity"),
									"stroke-opacity": userData.attr("stroke-opacity")
								});

				shape.id = userData.id;				
				*/
									
				/*
				var body_data = bodies[userData.id];					
										
				// Update shape
				userData.translate((center.x  - body_data.t_delta.x).toFixed(4) * SCALE, 
									(center.y - body_data.t_delta.y).toFixed(4) * SCALE);
					
				// Update delta	
				body_data.t_delta = center;
				
				//console.log(body_data.body.GetPosition());
				//userData.rotate(toDeg(currentAngle))
				
				*/						
			};
			
			self.DrawSegment = function (p1, p2, color, userData) {
				console.log("Drawing segment - " + p1 + "to" + p2);
			};
			
			self.DrawTransform = function (xf) {
				console.log("Drawing transform" + xf);
			};
		};
		Mixow.Utils.augment(RaphaelDraw, b2DebugDraw);
		
		/*	
			Custom Box2D contact listener for collison events
		*/
		var ContactListener = function(world) {
			var self = this,
				world = world;
			
			self.PostSolve = function(contact, impulse) {
				
				try{
					// Get the two bodies involved in the contact / collision
					var fixtureA = contact.GetFixtureA(),
						fixtureB = contact.GetFixtureB(),
						entityA = fixtureA.GetBody().GetUserData(),
						entityB = fixtureB.GetBody().GetUserData();

                        entityA.onContact(entityB, impulse.normalImpulses[0]);
                        entityB.onContact(entityA, impulse.normalImpulses[0]);

					// Trigger event	
					eve("mixow.game.collision", world, entityA, entityB, impulse.normalImpulses[0]);
				}
				catch(e){}				
			}
			
		};
		Mixow.Utils.augment(ContactListener, b2ContactListener);

		/*
			Create a debug renderer (Uses Canvas)
		*/
        var createRenderer = function() {
            var debugDraw = new b2DebugDraw();
            debugDraw.SetSprite($('#c')[0].getContext("2d"));
            debugDraw.SetDrawScale(SCALE);
            debugDraw.SetFillAlpha(0.3);
            debugDraw.SetLineThickness(1.0);
            debugDraw.SetFlags(b2DebugDraw.e_shapeBit | b2DebugDraw.e_jointBit);
            return debugDraw;
        };

		/*
			Create a Raphael renderer (Uses Raphael through RaphaelDraw class)
		*/
		var createRaphaelRenderer = function() {
			var renderer = new RaphaelDraw(self.draw);
			//renderer.SetSprite(canvasElement[0].getContext("2d"));
            renderer.SetDrawScale(SCALE);
            renderer.SetFillAlpha(0.3);
            renderer.SetLineThickness(1.0);
            renderer.SetFlags(b2DebugDraw.e_shapeBit);
			return renderer;
		};
		
        var createGround = function() {
            bodyDef.type = b2Body.b2_staticBody;

            // positions the center of the object (not upper left!)
            bodyDef.position.x = canvasWidth / 2 / SCALE;
            bodyDef.position.y = canvasHeight / SCALE;

            fixtureDef.shape = new b2PolygonShape;

            // half width, half height. eg actual height here is 1 unit
            fixtureDef.shape.SetAsBox((canvasWidth / SCALE) / 2, (10 / SCALE) / 2);
            world.CreateBody(bodyDef).CreateFixture(fixtureDef);
        };

		/*
			Checks for actor from the passed behavioral context
			
			world.add(ball, {
				behaviors: {
					'click': 'click-throw'
					'key': 'WASD'
					'key': 'platform'  // Up(Jump)-Down(Crouch)-Left(left)-Right(right)
				}
			});
		*/
		var inspectForActor = function(body, context) {
			if (context && context.behaviors && context.behaviors.key && !fpsActor) {

                // TODO: Need to wrap this in a Mixow.Game.Player class
				fpsActor = body;
                fpsKeyHandling = context.behaviors.key;
				fpsActor.makeHero();
				//viewPort.follow(fpsActor);
				//return;				
			}
			
			bodySet.push(body.getShape());
			
		};

        /*
            Internal function to draw a Box with Box2D
        */
        var addBox = function(shape, immovable, context) {
			
			bodyDef = new b2BodyDef;
			
            // Static or Dynamic?
            bodyDef.type = context.physics.immovable ? b2Body.b2_staticBody : b2Body.b2_dynamicBody;
			bodyDef.position.x = (shape.attr("x") + (shape.attr("width") / 2)) / SCALE;
            bodyDef.position.y = (shape.attr("y") + (shape.attr("height") / 2)) / SCALE;
			bodyDef.angle = toRadian(shape.attr("rotation"));
			
			/*
			 	http://www.box2d.org/forum/viewtopic.php?f=3&t=4733
			
				For a Platformer make sure friction and restitution are both at 0. This makes sure your 
				character wont "stick" to walls, slow down when they hit the ceiling, and wont bounce
			*/
			if (context && context.hero) {
				bodyDef.fixedRotation = true;				
			}
			
			fixtureDef = fixtureCreator();
			if (context && context.hero) {
				fixtureDef.friction = 0;
				fixtureDef.restitution = 0;
			}

            // Need polygon for rect/box
            fixtureDef.shape = new b2PolygonShape;
            fixtureDef.shape.SetAsBox(
                (shape.attr("width") / SCALE) / 2, //half width
                (shape.attr("height") / SCALE) / 2 //half height
            );            

			// Map to Raphael shapes
            var body = world.CreateBody(bodyDef);
			//body.SetUserData(shape);
			body.CreateFixture(fixtureDef);
			
			// Registers the shape
			if (!bodies.hasOwnProperty(shape.id)) {
				//bodySet.push(shape);
				var entity = new Mixow.Game.Body(body, shape, context);
                body.SetUserData(entity);
				bodies[shape.id] = {
					body: entity,
					context: context,
					immovable: immovable,
					t_delta: bodyDef.position,
					a_delta: shape.attr("rotation")
				};
				inspectForActor(entity, context);
			}
			
        };

		/*
            Internal function to draw a Circle with Box2D
        */
        var addCircle = function(shape, immovable, context) {
	
			bodyDef = new b2BodyDef;
			
            // Static or Dynamic?
            bodyDef.type = context.physics.immovable ? b2Body.b2_staticBody : b2Body.b2_dynamicBody;
			bodyDef.position.x = (shape.attr("cx") / SCALE);
            bodyDef.position.y = (shape.attr("cy") / SCALE);

			/*
			 	http://www.box2d.org/forum/viewtopic.php?f=3&t=4733
			
				For a Platformer make sure friction and restitution are both at 0. This makes sure your 
				character wont "stick" to walls, slow down when they hit the ceiling, and wont bounce
			*/
			if (context && context.hero) {
				bodyDef.fixedRotation = true;				
			}
			
			fixtureDef = fixtureCreator();
			if (context && context.hero) {
				fixtureDef.friction = 0;
				fixtureDef.restitution = 0;
			}

            fixtureDef.shape = new b2CircleShape(
                ((shape.attr("r") || shape.attr("rx")) / SCALE)
            );
            
            var body = world.CreateBody(bodyDef);
			//body.SetUserData(shape);
			body.CreateFixture(fixtureDef);						
			
			// Registers the shape
			if (!bodies.hasOwnProperty(shape.id)) {
				//bodySet.push(shape);
				var entity = new Mixow.Game.Body(body, shape, context);
                body.SetUserData(entity);
				bodies[shape.id] = {
					body: entity,
					context: context,
					immovable: immovable,
					t_delta: bodyDef.position,
					a_delta: body.GetAngle()
				};
				inspectForActor(entity, context);
			}
        };

		/*
			Polygon needs decomposition, if any angle is >= 180 deg. Collission will not happen at all, if that is violated.

			Here is a discussion on that - http://www.box2d.org/forum/viewtopic.php?f=8&t=414
		*/
		var addShape = function(shape, immovable, context) {
		
			bodyDef = new b2BodyDef;
			
			// Static or Dynamic?
            bodyDef.type = context.physics.immovable ? b2Body.b2_staticBody : b2Body.b2_dynamicBody;
			bodyDef.angle = toRadian(shape.attr("rotation"));
			
			/*
			 	http://www.box2d.org/forum/viewtopic.php?f=3&t=4733
			
				For a Platformer make sure friction and restitution are both at 0. This makes sure your 
				character wont "stick" to walls, slow down when they hit the ceiling, and wont bounce
			*/
			if (context && context.hero) {
				bodyDef.fixedRotation = true;				
			}
			
			fixtureDef = fixtureCreator();
			if (context && context.hero) {
				fixtureDef.friction = 0;
				fixtureDef.restitution = 0;
			}
			
			var computedResult = Mixow.Game.Math.computeVerticesAndCentroid(shape, SCALE);
			var vertices = computedResult.vertices,
			 	centroid = computedResult.centroid;

            // Shift the vertices w.r.t the centroid
            $.each(vertices, function(index, vertex) {
				vertex.SetV(b2Math.SubtractVV(vertex, centroid));
			});

            // Position the body to the centroid
			bodyDef.position = centroid;
			var body = world.CreateBody(bodyDef);

            // NOTE:
            //
            //      b2ChainShape would have been ideal here. However it's not fully implemented in the Box2D port.
            //      Instead we are fragmenting the path with series of polygons interpreted as edge using SetAsEdge,
            //      creating a series of fixtures for the body
            var vertex1 = vertices[0], vertex2 = null;
            for(var i = 1; i < vertices.length; i++) {
                vertex2 = vertices[i];
                fixtureDef = fixtureCreator();
                fixtureDef.shape = new b2PolygonShape;
                fixtureDef.shape.SetAsEdge(vertex1, vertex2);
                body.CreateFixture(fixtureDef);
                vertex1 = vertex2;
            }

			body.ResetMassData();
			
			// Registers the shape
			if (!bodies.hasOwnProperty(shape.id)) {
				//bodySet.push(shape);
				var entity = new Mixow.Game.Body(body, shape, context);
                body.SetUserData(entity);
				bodies[shape.id] = {
					body: entity,
					context: context,
					immovable: immovable,
					t_delta: centroid
				};
				inspectForActor(entity, context);
			}
		};
		
		/*
			Internal function to draw a n edge with Box2D
		*/
		var addEdge = function(shape, immovable, context) {
			
			bodyDef = new b2BodyDef;

			var points = $.map(shape.attr("path"), function(item, i) {
				return new b2Vec2(item[1] / SCALE, item[2] / SCALE);
			});
			
			if (points.length > 2)  {
				return;
			}
			
			var point1 = points[0], point2 = points[1];

			// Static or Dynamic?
            bodyDef.type = context.physics.immovable ? b2Body.b2_staticBody : b2Body.b2_dynamicBody;
			bodyDef.position.x = ((point1.x + point2.x) /  2) / SCALE;
            bodyDef.position.y = ((point1.y + point2.y) /  2) / SCALE;
			//bodyDef.angle = Math.abs(atan2((point2.y - point1.y), (point2.x - point1.x)));
			
			/*
			 	http://www.box2d.org/forum/viewtopic.php?f=3&t=4733
			
				For a Platformer make sure friction and restitution are both at 0. This makes sure your 
				character wont "stick" to walls, slow down when they hit the ceiling, and wont bounce
			*/
			if (context && context.hero) {
				bodyDef.fixedRotation = true;				
			}
			
			fixtureDef = fixtureCreator();
			if (context && context.hero) {
				fixtureDef.friction = 0;
				fixtureDef.restitution = 0;
			}

            // Need polygon for rect/box
            fixtureDef.shape = new b2PolygonShape;
            fixtureDef.shape.SetAsEdge(point1, point2);

			// Map to Raphael shapes
            var body = world.CreateBody(bodyDef);
			//body.SetUserData(shape);
			body.CreateFixture(fixtureDef);
			
			// Registers the shape
			if (!bodies.hasOwnProperty(shape.id)) {
				//bodySet.push(shape);
				var entity = new Mixow.Game.Body(body, shape, context);
                body.SetUserData(entity);
				bodies[shape.id] = {
					body: entity,
					context: context,
					immovable: immovable,
					t_delta: bodyDef.position					
				};
				inspectForActor(entity, context);
			}
		};		
		
		/*
			Get physics body at given event point
		*/
		var getBodyAtMouse = function(e) {
			
			var world = getPhysicsWorld();
			var body = null;
			var worldQueryCallback = function(fixture) {		

				if (fixture) {
					// Retrieves a body
					body = fixture.GetBody();
				}

				return false;			
			};
			world.QueryPoint(worldQueryCallback, new b2Vec2(e.offsetX / SCALE, e.offsetY / SCALE));				
			return body;
		};
				
		/*
			Returns the physics word, wrapped by this Mixow.Game.World
		*/		
		var getPhysicsWorld = function() {
			return world;
		};

        self.getWorld = function() {
            return world;
        };
		
		
		var addKeyboardBehaviors = function() {

            if (!fpsActor) {
                return;
            }

            // Key handler
			var _keyboard_handler = function(e) {
                switch(e.data) {
                    case "up":
                    case "W":
                    case "w":
                        // Jump
						keyFlags.up = true;
                        //fpsActor.impartVelocity(-90, 3);
                        break;
                    case "down":
                        // NOP
                        break;
                    case "left":
                    case "A":
                    case "a":
                        // Go left
						keyFlags.left = true;
                        //fpsActor.impartVelocity(0, -3);
                        break;
                    case "right":
                    case "D":
                    case "d":
                        // Go right
						keyFlags.right = true;
                        //fpsActor.impartVelocity(0, 3);
                        break;
                }
            };

            // Check for the type of key-handling expected
            if (fpsKeyHandling == "WASD") {
                //documentElement.bind('keydown', 'W', _keyboard_handler);
				documentElement.bind('keyup', 'W', _keyboard_handler);
				//documentElement.bind('keydown', 'w', _keyboard_handler);
				documentElement.bind('keyup', 'w', _keyboard_handler);
                //canvasElement.live('keydown', 'S', _keyboard_move_handler);
                //documentElement.bind('keydown', 'A', _keyboard_handler);
				documentElement.bind('keyup', 'A', _keyboard_handler);
				//documentElement.bind('keydown', 'a', _keyboard_handler);
				documentElement.bind('keyup', 'a', _keyboard_handler);
                //documentElement.bind('keydown', 'D', _keyboard_handler);
				documentElement.bind('keyup', 'D', _keyboard_handler);
				//documentElement.bind('keydown', 'd', _keyboard_handler);
				documentElement.bind('keyup', 'd', _keyboard_handler);
            }
            else if (fpsKeyHandling == "platform") {
                documentElement.bind('keydown', 'up', _keyboard_handler);
                //canvasElement.live('keydown', 'down', _keyboard_move_handler);
                documentElement.bind('keydown', 'left', _keyboard_handler);
                documentElement.bind('keydown', 'right', _keyboard_handler);
            }

		};
		
		var addMouseBehaviors = function() {
			canvasElement.mousedown(Mixow.Utils.bind(function(e) {							
								
				var body = getBodyAtMouse(e);
				if (body && !mouseJoint) {
					
					var entity = body.GetUserData();
                    mouseJoint = {
                        joint: entity.onMouseDown(e),
                        entity: entity
                    }
				}			
				
			}, self));
			canvasElement.mousemove(Mixow.Utils.bind(function(e) {

                if (mouseJoint) {
                    mouseJoint.entity.onMouseMove(e);
                }
				
			}, self));
			canvasElement.mouseup(Mixow.Utils.bind(function(e) {							
			
                if (mouseJoint) {
                    mouseJoint.entity.onMouseUp(e);
                    mouseJoint = null;
                }
				
			}, self));
		};
		
		
		/*
			Adds behavior handlers to world bodies based on context set. Typically behavior contexts are
			set as below -
			
			world.add(ball, {
				behaviors: {
					'click': 'click-throw'
					'key': 'WASD'
					'key': 'platform'  // Up(Jump)-Down(Crouch)-Left(left)-Right(right)
				}
			});
						
		*/
		var addBehaviorHandlers = function() {
						
			addMouseBehaviors();		
			addKeyboardBehaviors();
		};
		
		
        /* Adds a DYNAMIC body to the world */
        self.add = function(shape, context) {

            context = context || {};

            context.viewPort = viewPort;

            context.physics = context.physics || {};
            context.physics.immovable = false;
            context.physics.world = self;

			// Stops rotation
			if (context && context.behaviors && context.behaviors.key && context.behaviors.key == "platform") {
				context.hero = true;
			}

            switch(shape.type) {
                case "rect":
				case "image":
                    addBox(shape, false, context);
                    break;

                case "circle":
				case "ellipse":
                    addCircle(shape, false, context);
                    break;

				case "path":
					if (typeof(shape.subtype) != "undefined") {						
						var subtype = shape.subtype;
						switch(subtype) {
							case "line":
								addEdge(shape, false, context);
								break;
						}
					}
					else {
						addShape(shape, false, context);
					}
            }
        };

        /* Adds a STATIC body to the world */
        self.addStatic = function(shape, context) {

            context = context || {};

            context.viewPort = viewPort;

            context.physics = context.physics || {};
            context.physics.immovable = true;
            context.physics.world = self;

            switch(shape.type) {
                case "rect":
				case "image":
                    addBox(shape, true, context);
                    break;

                case "circle":
				case "ellipse":
                    addCircle(shape, true, context);
                    break;				

				case "path":
					if (typeof(shape.subtype) != "undefined") {						
						var subtype = shape.subtype;
						switch(subtype) {
							case "line":
								addEdge(shape, true, context);
								break;
						}
					}
					else {
						addShape(shape, true, context);
					}
					
            }
        };

		/*
			Adds a background (sot of Layer 0) to the world. This is typically a static box 
		*/
		self.addBackground = function(image) {
		
			image.hide();
			containerElement.css("background-image", "url(" + image.attr("src") + ")");
		};

		/*
			Retrieves a Mixow.Game.Body (Wrapper for Box2D Body) given it's id in the world
		*/
		self.getById = function(id) {
			return bodies[id]["body"];
		};
	
		/*
			Update all bodies (those are dynamic or kinematic) in the world
		*/
		var updateBodies = function() {
			var entity = null;
			for (var b = world.GetBodyList(); b; b = b.GetNext()) {
				
				// Ideally we shouldn't bother about static bodies. But while doing platform
				// scrolling, we need to update position of static bodies as well
				if ((b.GetType() == b2Body.b2_dynamicBody) || 
					(fpsActor && b.GetType() == b2Body.b2_staticBody)) {
										
					// We store the entire Raphael shape (simple for now) as UserData					
					entity = b.GetUserData();
					if (entity) {
						entity.update();
					}
				}
			}
		};
		
		/*
			Handle ViewPort positioning
		*/
		var handleScroll = function() {
			
			if (fpsActor) {
				
				// Get pos in pixel
				var pos = fpsActor.getPosition();				
				var scrollBy =  (viewPort.width / 2) - (pos.x - viewPort.x);
				
				if ((viewPort.x <= 0) && (scrollBy > 0)) {
					return;
				}
				else if (viewPort.x + viewPort.width >= canvasWidth) {
					
					// Hit the right end point, check for left.
					if (scrollBy > 0) {
						viewPort.scroll("_x", scrollBy);
						viewPort.x += -scrollBy;
					}
					else {
						return;
					}															
				}
				else {
					viewPort.scroll("_x", scrollBy);
					viewPort.x += -scrollBy;
				}				
			}
		};


		var handleKeyboardBuffers = function() {
			if (keyFlags.up) {
				//fpsActor.impulse(-90, 200);				
				fpsActor.impartVelocity(toRadian(-90), 10)
				keyFlags.up = false;
			}
			
			if (keyFlags.left) {				
				fpsActor.impartVelocity(0, -5);				
				keyFlags.left = false;
			}
			
			if (keyFlags.right) {				
				fpsActor.impartVelocity(0, 5);				
				keyFlags.right = false;
			}
		};
		
		/*
            Core loop
        */
        var update = function() {
	
			// Handle keyboard buffers
			handleKeyboardBuffers();
			
            world.Step(
                step,
                velocityIterations,    //velocity iterations
                positionIterations     //position iterations
            );
			world.ClearForces();
						
			updateBodies();
			handleScroll();
			
            // Update the renderer...
            //world.DrawDebugData();			            
						

            //stats.update();
			if (stopped) {				
				stopped = false;
			}            
			else {
				requestAnimFrame(update);
			}
        };

        /* Run the game loop */
        self.run = function() {

			addBehaviorHandlers();

			// Set renderer 
            var renderer = createRaphaelRenderer();
			//var renderer = createRenderer();
            world.SetDebugDraw(renderer);

			// Set contact listener
			world.SetContactListener(new ContactListener(world));

            requestAnimFrame(update);
        };

		/*
			Stop a game loop
		*/
		self.stop = function() {
			stopped = true;
		};

    };

    /* Hook this as a Raphael plugin */
    Raphael.fn.world = function() {
        return new Mixow.Game.World(this);
    };

})(jQuery, Raphael, Box2D);
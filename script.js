// --- Basic Three.js Setup ---
let scene, camera, renderer, world, controls, bubbleClusterGroup;
let bubbles = []; // Array to hold our bubble objects (mesh + body + data)
const clock = new THREE.Clock(); // For physics time step
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let bubblePhysicsMaterial; // Declare in higher scope

const sceneContainer = document.getElementById('scene-container');

function init() {
    // Scene
    scene = new THREE.Scene();
    // Fog for a softer background effect
    scene.fog = new THREE.Fog(0xf0f0f0, 10, 50);

    // Camera
    camera = new THREE.PerspectiveCamera(75, sceneContainer.clientWidth / sceneContainer.clientHeight, 0.1, 1000);
    camera.position.z = 15; // Move camera back

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0xf0f0f0); // Match body background initially
    sceneContainer.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Group to hold bubble meshes for collective rotation
    bubbleClusterGroup = new THREE.Group();
    scene.add(bubbleClusterGroup);

    // --- Physics Setup (Cannon.js) ---
    world = new CANNON.World();
    // Set gravity to zero, we'll use custom forces for floating/clustering
    world.gravity.set(0, 0, 0);
    world.broadphase = new CANNON.NaiveBroadphase(); // Simple broadphase for now
    world.solver.iterations = 10; // Increase for more stability

    // Define material properties for bubbles
    bubblePhysicsMaterial = new CANNON.Material('bubbleMaterial'); // Assign to higher scope variable
    const bubbleContactMaterial = new CANNON.ContactMaterial(
        bubblePhysicsMaterial,
        bubblePhysicsMaterial,
        {
            friction: 0.1, // Low friction
            restitution: 0.7 // Bouncy
        }
    );
    world.addContactMaterial(bubbleContactMaterial);

    // --- Camera Controls (OrbitControls) ---
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Smoother interaction
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false; // Keep panning relative to world origin
    controls.minDistance = 5;  // Prevent zooming too close
    controls.maxDistance = 50; // Prevent zooming too far
    controls.target.set(0, 2, 0); // Focus controls around the area bubbles float to
    controls.update();

    // --- UI Event Listeners ---
    const addBubbleBtn = document.getElementById('add-bubble-btn');
    addBubbleBtn.addEventListener('click', handleAddBubble);

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);
    sceneContainer.addEventListener('click', onMouseClick, false);

    // Start animation loop
    animate();
}

function onWindowResize() {
    camera.aspect = sceneContainer.clientWidth / sceneContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
}

function handleAddBubble() {
    const taskName = document.getElementById('task-name').value;
    const dueDate = document.getElementById('due-date').value;
    const priority = parseInt(document.getElementById('priority').value, 10);
    const category = document.getElementById('category').value;
    const repeating = document.getElementById('repeating').checked;

    if (!taskName) {
        alert('Please enter a task name.');
        return;
    }

    console.log('Adding Bubble:', { taskName, dueDate, priority, category, repeating });

    // --- Bubble Property Calculation ---

    // 1. Urgency (Size)
    const minRadius = 0.5;
    const maxRadius = 2.0;
    let radius = minRadius; // Default size
    if (dueDate) {
        const today = new Date();
        const due = new Date(dueDate);
        today.setHours(0, 0, 0, 0); // Normalize dates to midnight
        due.setHours(0, 0, 0, 0);
        const timeDiff = due.getTime() - today.getTime();
        const dayDiff = Math.max(0, Math.ceil(timeDiff / (1000 * 3600 * 24))); // Days remaining, min 0

        // Map days remaining to radius (e.g., 0 days = maxRadius, 30+ days = minRadius)
        const urgencyFactor = Math.max(0, 1 - (dayDiff / 30)); // Normalize urgency (0 to 1) over 30 days
        radius = minRadius + (maxRadius - minRadius) * urgencyFactor;
    } else {
        radius = (minRadius + maxRadius) / 2; // Average size if no due date
    }


    // 2. Priority (Opacity)
    const minOpacity = 0.4;
    const maxOpacity = 1.0;
    // Map priority (1-5) to opacity
    const opacity = minOpacity + (maxOpacity - minOpacity) * ((priority - 1) / 4);


    // 3. Category (Color) - Simple hash function for consistent colors
    let color = 0xcccccc; // Default grey
    if (category) {
        let hash = 0;
        for (let i = 0; i < category.length; i++) {
            hash = category.charCodeAt(i) + ((hash << 5) - hash);
            hash = hash & hash; // Convert to 32bit integer
        }
        // Use HSV for better color distribution from hash
        const hue = Math.abs(hash % 360);
        const saturation = 0.7; // Keep saturation relatively high
        const value = 0.8; // Keep value relatively high
        color = new THREE.Color().setHSL(hue / 360, saturation, value).getHex();
    }

    // --- Create Bubble Mesh ---

    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = new THREE.MeshPhongMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        shininess: 50 // Add some shine
    });
    const bubbleMesh = new THREE.Mesh(geometry, material);
    // Add mesh to the group instead of the scene directly
    bubbleClusterGroup.add(bubbleMesh);

    // --- Create Physics Body ---
    const bubbleShape = new CANNON.Sphere(radius);
    const bubbleBody = new CANNON.Body({
        mass: radius * radius * radius, // Mass proportional to volume
        material: bubblePhysicsMaterial,
        position: new CANNON.Vec3(0, -5, 0), // Start below the center
        shape: bubbleShape,
        linearDamping: 0.4, // Simulate water resistance
        angularDamping: 0.4
    });

    // Give it an initial upward push
    const impulseStrength = 5 + Math.random() * 5;
    bubbleBody.applyLocalImpulse(
        new CANNON.Vec3(0, impulseStrength, 0), // Upward force
        new CANNON.Vec3(Math.random() - 0.5, 0, Math.random() - 0.5) // Apply slightly off-center for initial spin
    );


    world.addBody(bubbleBody);

    // Store mesh, body, and data together
    bubbles.push({
        mesh: bubbleMesh,
        body: bubbleBody,
        taskName, dueDate, priority, category, repeating
    });

    // Clear input fields
    document.getElementById('task-name').value = '';
    document.getElementById('due-date').value = '';
    document.getElementById('priority').value = 3; // Reset to default
    document.getElementById('category').value = 'General'; // Reset to default
    document.getElementById('repeating').checked = false; // Reset to default
}

// --- Interaction Handling ---
function onMouseClick(event) {
    // Calculate mouse position in normalized device coordinates (-1 to +1)
    mouse.x = (event.clientX / sceneContainer.clientWidth) * 2 - 1;
    mouse.y = - (event.clientY / sceneContainer.clientHeight) * 2 + 1;

    // Update the picking ray with the camera and mouse position
    raycaster.setFromCamera(mouse, camera);

    // Calculate objects intersecting the picking ray
    const intersects = raycaster.intersectObjects(bubbles.map(b => b.mesh)); // Check only bubble meshes

    if (intersects.length > 0) {
        const clickedMesh = intersects[0].object; // The closest intersected object

        // Find the corresponding bubble object in our array
        const clickedBubbleIndex = bubbles.findIndex(bubble => bubble.mesh === clickedMesh);

        if (clickedBubbleIndex !== -1) {
            const clickedBubble = bubbles[clickedBubbleIndex];
            console.log('Clicked Bubble:', clickedBubble.taskName);

            if (clickedBubble.repeating) {
                console.log('Repeating bubble - resetting...');
                // --- Reset Repeating Bubble ---

                // 1. Reset Physics: Position, Velocity, Angular Velocity
                clickedBubble.body.position.set(0, -5, 0); // Back to bottom
                clickedBubble.body.velocity.set(0, 0, 0);
                clickedBubble.body.angularVelocity.set(0, 0, 0);

                // 2. Re-apply initial impulse
                const impulseStrength = 5 + Math.random() * 5;
                clickedBubble.body.applyLocalImpulse(
                    new CANNON.Vec3(0, impulseStrength, 0),
                    new CANNON.Vec3(Math.random() - 0.5, 0, Math.random() - 0.5)
                );

                // 3. Optional: Update Due Date (e.g., add a week/day) - More complex, skip for now
                // clickedBubble.dueDate = calculateNextDueDate(clickedBubble.dueDate);

                // 4. Optional: Recalculate size based on new due date - Skip for now
                // const newRadius = calculateRadius(clickedBubble.dueDate);
                // clickedBubble.body.shapes[0].radius = newRadius;
                // clickedBubble.body.updateBoundingRadius();
                // clickedBubble.mesh.geometry = new THREE.SphereGeometry(newRadius, 32, 32);

                // Ensure it's awake if it went to sleep
                clickedBubble.body.wakeUp();

            } else {
                console.log('Non-repeating bubble - removing...');
                // --- Remove Non-Repeating Bubble ---
                // Remove from physics world
                world.removeBody(clickedBubble.body);

                // Remove from scene
                // Remove from group
                bubbleClusterGroup.remove(clickedBubble.mesh);

                // Remove from our tracking array
                bubbles.splice(clickedBubbleIndex, 1);
            }
        }
    }
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);

    // --- Physics Update ---
    const deltaTime = clock.getDelta();
    // Use a fixed time step for stability if needed, or cap deltaTime
    const fixedTimeStep = 1 / 60;
    const maxSubSteps = 3;
    world.step(fixedTimeStep, deltaTime, maxSubSteps);

    // --- Apply Central Attraction Force & Sync Meshes ---
    const clusterCenter = new CANNON.Vec3(0, 2, 0); // Target center for the cluster
    const attractionStrength = 0.5; // Adjust this value to change how strongly bubbles are pulled

    bubbles.forEach(bubble => {
        // Calculate vector from bubble to center
        const forceDirection = clusterCenter.vsub(bubble.body.position); // Vector pointing towards center
        const distance = forceDirection.length();

        // Normalize the direction vector
        forceDirection.normalize();

        // Apply force proportional to distance (optional, could just use constant strength)
        // let forceMagnitude = attractionStrength * distance;
        let forceMagnitude = attractionStrength; // Simpler constant force for now

        // Apply the force
        bubble.body.applyForce(forceDirection.scale(forceMagnitude), bubble.body.position);

        // Sync mesh position/rotation
        bubble.mesh.position.copy(bubble.body.position);
        bubble.mesh.quaternion.copy(bubble.body.quaternion);
    });

    // --- Update Controls ---
    controls.update(); // Required if enableDamping is true

    // --- Rotate the Cluster ---
    // Rotate slowly around the Y axis
    bubbleClusterGroup.rotation.y += 0.001; // Adjust speed as needed


    renderer.render(scene, camera);
}

// --- Initialization ---
init();
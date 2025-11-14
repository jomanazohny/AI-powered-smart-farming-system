import os
from flask import Flask, request, jsonify
import base64
import numpy as np
from PIL import Image
from io import BytesIO
from tensorflow.keras.models import load_model
from tensorflow.keras.applications import EfficientNetB0 
from tensorflow.keras.layers import Dense, GlobalAveragePooling2D
from tensorflow.keras.models import Model

app = Flask(__name__)

MODELS_CONFIG = {
    'potato': {
        'path': 'Model/mango/efficientnet_stage2_potato_finetuned.weights.h5',
        'type': 'weights',
        'classes': ['Early Blight', 'Late Blight', 'Healthy'],
        'num_classes': 3,
        'size': (224, 224) 
    },
    'mango': {
        'path': 'Model/mango/efficientnet_final_mango.weights.h5',
        'type': 'weights', 
        'classes': [
            'Anthracnose', 'Bacterial Canker', 'Cutting Weevil', 
            'Die Back', 'Gall Midge', 'Powdery Mildew', 'Sooty Mould', 'Healthy'
        ], 
        'num_classes': 8, 
        'size': (224, 224)
    },
    'wheat': {
        'path': 'Model/potato/efficientnet_stage1.wheat.h5', 
        'type': 'weights', 
        'classes': ['Leaf Rust', 'Stem Rust', 'Healthy'],
        'num_classes': 3,
        'size': (224, 224)
    },
}

def create_model_from_weights(config):
    """
    Builds an EfficientNetB0 model structure and loads weights into it.
    """
    print(f"Building EfficientNetB0 structure for: {config['path']}...")
    img_shape = config['size'] + (3,)
    num_classes = config['num_classes']

    base_model = EfficientNetB0(include_top=False, weights=None, input_shape=img_shape)

    x = base_model.output
    x = GlobalAveragePooling2D()(x)
    predictions = Dense(num_classes, activation='softmax')(x) 
    
    model = Model(inputs=base_model.input, outputs=predictions)

    model.load_weights(config['path'])
    print(f"Weights loaded successfully for {config['path']}.")
    return model

LOADED_MODELS = {}

try:
    for crop, config in MODELS_CONFIG.items():
        if os.path.exists(config['path']):
            
            if config['type'] == 'weights':
                model = create_model_from_weights(config)
            
            else: 
               
                print(f"Loading full model for: {crop}")
                model = load_model(config['path'])
            
            LOADED_MODELS[crop] = {
                'model': model,
                'classes': config['classes'],
                'size': config['size']
            }
        else:
            print(f"WARNING: Model file not found at path: {config['path']}")
    
    if not LOADED_MODELS:
        raise Exception("No ML models were loaded. Check paths.")
        
except Exception as e:
    print(f"FATAL ERROR loading models: {e}")
    LOADED_MODELS = None 

def preprocess_image(base64_string, target_size):
    """Decodes base64, resizes, and prepares image for model prediction."""
    img_data = base64.b64decode(base64_string)
    img = Image.open(BytesIO(img_data)).convert('RGB')
    img = img.resize(target_size)
    img_array = np.array(img, dtype=np.float32)
    img_array = np.expand_dims(img_array, axis=0)
    

    return img_array / 255.0


@app.route('/diagnose', methods=['POST'])
def diagnose():
    if not LOADED_MODELS:
        return jsonify({"error": "ML Service is unavailable: Models failed to load."}), 503
        
    data = request.json
    base64_image = data.get('image')
    crop_type = data.get('crop_type') 

    if not base64_image:
        return jsonify({"error": "No image data provided in the request body."}), 400

    if not crop_type or crop_type not in LOADED_MODELS:
        return jsonify({"error": f"Model for crop type '{crop_type}' not found."}), 404

    try:
        current_model_data = LOADED_MODELS[crop_type]
        model = current_model_data['model']
        class_names = current_model_data['classes']
        image_size = current_model_data['size']
        
        processed_image = preprocess_image(base64_image, image_size)
        
        predictions = model.predict(processed_image)
        predicted_class_index = np.argmax(predictions[0])
        predicted_disease = class_names[predicted_class_index]
        confidence = float(predictions[0][predicted_class_index])

        if predicted_disease == 'Healthy':
            treatment = "لا يوجد مرض ملحوظ. استمر في رعاية النباتات جيدا."
        else:
            treatment = f"تم تشخيص المرض كـ **{predicted_disease}. يرجى مراجعة الخبراء الزراعيين وتطبيق العلاجات الموصى بها لهذا المرض."

        return jsonify({
            "disease": predicted_disease,
            "treatment": treatment
        })

    except Exception as e:
        print(f"Prediction failed for {crop_type}: {e}")
        return jsonify({"error": f"Prediction failed due to an internal server issue. Details: {str(e)}", "disease": "خطأ في التشخيص"}), 500

if __name__ == '__main__':
    print("Starting Flask server on http://0.0.0.0:5000")
    app.run(debug=True, host='0.0.0.0', port=5000)
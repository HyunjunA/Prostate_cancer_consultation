# from transformers import Pix2StructProcessor, Pix2StructForConditionalGeneration
# import requests
# from PIL import Image


# # Feature Extractor
# processor = Pix2StructProcessor.from_pretrained('google/matcha-chart2text-pew')
# # Model
# model = Pix2StructForConditionalGeneration.from_pretrained('google/matcha-chart2text-pew')

# url = "./test.png"
# image = Image.open(requests.get(url, stream=True).raw)

# inputs = processor(images=image, text='Summary', return_tensors="pt")
# predictions = model.generate(**inputs, max_new_tokens=512)

# # Print Chart summary
# print(processor.decode(predictions[0], skip_special_tokens=True))


from transformers import Pix2StructProcessor, Pix2StructForConditionalGeneration
from PIL import Image

# Feature Extractor
processor = Pix2StructProcessor.from_pretrained('google/matcha-chart2text-pew')
# Model
model = Pix2StructForConditionalGeneration.from_pretrained('google/matcha-chart2text-pew')

# 로컬 파일 경로
image_path = "./test3.png"
# 직접 로컬 이미지 파일 열기
image = Image.open(image_path)

inputs = processor(images=image, text='Summary', return_tensors="pt")
predictions = model.generate(**inputs, max_new_tokens=512)

# Print Chart summary
print("Chart Summary:")
print(processor.decode(predictions[0], skip_special_tokens=True))